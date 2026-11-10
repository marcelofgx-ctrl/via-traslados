package uy.viatraslados.conductor;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Sesión renovable encriptada y guardada detrás de Android Keystore.
 *
 * NUNCA guarda contraseña. No exporta huellas, claves AES ni refresh token sin cifrar.
 * Una clave AES con autenticación por operación exige una huella antes de cada descifrado.
 * El token guardado se puede revocar inmediatamente desde el backend.
 */
public final class BiometricVault {
    private static final String KEY_ALIAS = "via_traslados_staff_refresh_v1";
    private static final String STORAGE = "via_staff_biometric";
    private static final String DATA = "encrypted_refresh";
    private static final String IV = "initialization_vector";
    private BiometricVault(){}

    public interface Callback {
        void complete(String token, String error);
    }
    public interface SaveCallback {
        void complete(boolean saved, String detail);
    }

    public static boolean supported(Activity activity) {
        if(Build.VERSION.SDK_INT < 28) return false;
        try {
            KeyguardManager keyguard=(KeyguardManager)activity.getSystemService(Context.KEYGUARD_SERVICE);
            if(keyguard==null||!keyguard.isDeviceSecure()) return false;
            if(Build.VERSION.SDK_INT >= 29){
                android.hardware.biometrics.BiometricManager manager =
                    (android.hardware.biometrics.BiometricManager)activity.getSystemService(Context.BIOMETRIC_SERVICE);
                if(manager==null)return false;
                if(Build.VERSION.SDK_INT >= 30)
                    return manager.canAuthenticate(android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_STRONG)
                        ==android.hardware.biometrics.BiometricManager.BIOMETRIC_SUCCESS;
                return manager.canAuthenticate()==android.hardware.biometrics.BiometricManager.BIOMETRIC_SUCCESS;
            }
            android.hardware.fingerprint.FingerprintManager fp=
                (android.hardware.fingerprint.FingerprintManager)activity.getSystemService(Context.FINGERPRINT_SERVICE);
            return fp!=null && fp.isHardwareDetected() && fp.hasEnrolledFingerprints();
        }catch(Exception e){return false;}
    }
    private static SharedPreferences prefs(Activity a){
        return a.getSharedPreferences(STORAGE,Context.MODE_PRIVATE);
    }
    public static boolean hasSaved(Activity a) {
        return prefs(a).contains(DATA)&&prefs(a).contains(IV);
    }
    public static void clear(Activity a){
        prefs(a).edit().remove(DATA).remove(IV).apply();
        try{
            KeyStore store=KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            if(store.containsAlias(KEY_ALIAS))store.deleteEntry(KEY_ALIAS);
        }catch(Exception ignored){}
    }
    private static SecretKey key(boolean generate) throws Exception{
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        SecretKey existing=(SecretKey)store.getKey(KEY_ALIAS,null);
        if(existing!=null)return existing;
        if(!generate)throw new IllegalStateException("La huella configurada cambió. Ingresá con tu contraseña.");
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        KeyGenParameterSpec.Builder params=new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true);
        if(Build.VERSION.SDK_INT>=30) {
            params.setUserAuthenticationParameters(0,KeyProperties.AUTH_BIOMETRIC_STRONG);
        } else {
            params.setUserAuthenticationValidityDurationSeconds(-1);
        }
        generator.init(params.build());
        return generator.generateKey();
    }
    private static BiometricPrompt prompt(Activity activity,BiometricPrompt.AuthenticationCallback callback){
        Executor executor=activity.getMainExecutor();
        return new BiometricPrompt.Builder(activity)
            .setTitle("Vía Traslados")
            .setSubtitle("Confirmá con tu huella para desbloquear la sesión")
            .setNegativeButton("Usar contraseña",executor,(d,w)->{})
            .build();
    }
    public static void save(Activity activity,String refreshToken,SaveCallback callback){
        if(!supported(activity)||refreshToken==null||!refreshToken.matches("[a-fA-F0-9]{64}")){
            callback.complete(false,"No hay una huella compatible configurada.");return;
        }
        try {
            final Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE,key(true));
            BiometricPrompt.AuthenticationCallback auth=new BiometricPrompt.AuthenticationCallback(){
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result){
                    super.onAuthenticationSucceeded(result);
                    try {
                        Cipher opened=result.getCryptoObject().getCipher();
                        byte[] ciphertext=opened.doFinal(refreshToken.getBytes(StandardCharsets.UTF_8));
                        String encoded=Base64.encodeToString(ciphertext,Base64.NO_WRAP);
                        String iv=Base64.encodeToString(opened.getIV(),Base64.NO_WRAP);
                        // commit es síncrono para que cierre de app no pierda la credencial.
                        prefs(activity).edit().putString(DATA,encoded).putString(IV,iv).commit();
                        callback.complete(true,"Ingreso con huella activado.");
                    }catch(Exception e){callback.complete(false,"No se pudo proteger la sesión.");}
                }
                @Override public void onAuthenticationError(int code,CharSequence msg){
                    super.onAuthenticationError(code,msg);
                    callback.complete(false,"No se activó la huella.");
                }
            };
            prompt(activity,auth).authenticate(new BiometricPrompt.CryptoObject(cipher),
                new CancellationSignal(),activity.getMainExecutor(),auth);
        }catch(Exception e){callback.complete(false,"No fue posible configurar la huella.");}
    }
    public static void unlock(Activity activity,Callback callback){
        if(!supported(activity)||!hasSaved(activity)){
            callback.complete(null,"No hay una sesión biométrica disponible.");return;
        }
        try {
            final String blob=prefs(activity).getString(DATA,"");
            final byte[] iv=Base64.decode(prefs(activity).getString(IV,""),Base64.NO_WRAP);
            final Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,key(false),new GCMParameterSpec(128,iv));
            BiometricPrompt.AuthenticationCallback auth=new BiometricPrompt.AuthenticationCallback(){
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result){
                    super.onAuthenticationSucceeded(result);
                    try {
                        Cipher opened=result.getCryptoObject().getCipher();
                        byte[] plain=opened.doFinal(Base64.decode(blob,Base64.NO_WRAP));
                        String secret=new String(plain,StandardCharsets.UTF_8);
                        callback.complete(secret,null);
                    }catch(Exception e){
                        clear(activity);
                        callback.complete(null,"La huella ya no puede abrir esta sesión. Ingresá con tu contraseña.");
                    }
                }
                @Override public void onAuthenticationError(int code,CharSequence message){
                    super.onAuthenticationError(code,message);
                    callback.complete(null,"Autenticación cancelada.");
                }
            };
            prompt(activity,auth).authenticate(new BiometricPrompt.CryptoObject(cipher),
                new CancellationSignal(),activity.getMainExecutor(),auth);
        }catch(Exception e){
            clear(activity);
            callback.complete(null,"La sesión biométrica se invalidó. Usá tu contraseña.");
        }
    }
}
