package uy.viatraslados.conductor;

import android.app.*;
import android.content.*;
import android.media.*;
import android.net.Uri;
import android.os.*;

/** One original three-phrase sound per request, honoring notification settings. */
final class AlertSignal {
    static final String CHANNEL="via_new_requests_premium_v2";
    private static final String SIGNALS="via_alert_signal_v2",POSTED="via_alert_posted_v1";
    private static final long[] PULSE={0,950,200,950,200,950,200,750};
    private static Ringtone tone;
    private static Vibrator motor;
    private static Uri sound(Context c){return Uri.parse("android.resource://"+c.getPackageName()+"/raw/via_alert");}
    private static AudioAttributes attrs(){return new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();}
    static void ensureChannel(Context c){
        NotificationManager nm=c.getSystemService(NotificationManager.class);if(nm==null)return;
        if(nm.getNotificationChannel(CHANNEL)!=null)return;
        NotificationChannel ch=new NotificationChannel(CHANNEL,"Nuevas solicitudes · alerta premium",NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Aviso sonoro y vibración para solicitudes de traslado");ch.setSound(sound(c),attrs());ch.enableVibration(true);ch.setVibrationPattern(PULSE);nm.createNotificationChannel(ch);
    }
    static boolean wasSounded(Context c,String key){return c.getSharedPreferences(SIGNALS,Context.MODE_PRIVATE).getBoolean(key,false)||c.getSharedPreferences(POSTED,Context.MODE_PRIVATE).getBoolean(key,false);}
    static void markSounded(Context c,String key){c.getSharedPreferences(SIGNALS,Context.MODE_PRIVATE).edit().putBoolean(key,true).apply();}
    static void playInside(Context c,String key){
        if(key.isEmpty()||wasSounded(c,key))return;
        ensureChannel(c);NotificationManager nm=c.getSystemService(NotificationManager.class);
        if(nm==null||!nm.areNotificationsEnabled())return;
        NotificationChannel ch=nm.getNotificationChannel(CHANNEL);
        if(ch==null||ch.getImportance()==NotificationManager.IMPORTANCE_NONE)return;
        markSounded(c,key);
        playExternal(c);
    }
    static void playExternal(Context c){
        ensureChannel(c);NotificationManager nm=c.getSystemService(NotificationManager.class);
        if(nm==null||!nm.areNotificationsEnabled())return;
        NotificationChannel ch=nm.getNotificationChannel(CHANNEL);
        if(ch==null||ch.getImportance()==NotificationManager.IMPORTANCE_NONE)return;
        if(nm.getCurrentInterruptionFilter()!=NotificationManager.INTERRUPTION_FILTER_ALL)return;
        AudioManager audio=c.getSystemService(AudioManager.class);if(audio==null||audio.getRingerMode()==AudioManager.RINGER_MODE_SILENT)return;
        stop(c);
        if(audio.getRingerMode()==AudioManager.RINGER_MODE_NORMAL&&ch.getSound()!=null){
            try{tone=RingtoneManager.getRingtone(c,ch.getSound());if(tone==null)tone=RingtoneManager.getRingtone(c,android.provider.Settings.System.DEFAULT_NOTIFICATION_URI);if(tone!=null){tone.setAudioAttributes(attrs());tone.play();}}catch(RuntimeException ignored){}
        }
        if(ch.shouldVibrate()){
            try{if(Build.VERSION.SDK_INT>=31){VibratorManager vm=c.getSystemService(VibratorManager.class);motor=vm==null?null:vm.getDefaultVibrator();}else motor=c.getSystemService(Vibrator.class);
                if(motor!=null&&motor.hasVibrator()){long[] wave=ch.getVibrationPattern();if(wave==null||wave.length==0)wave=PULSE;motor.vibrate(VibrationEffect.createWaveform(wave,-1),attrs());}
            }catch(RuntimeException ignored){}
        }
    }
    static void stop(Context c){if(tone!=null){try{tone.stop();}catch(RuntimeException ignored){}tone=null;}if(motor!=null){try{motor.cancel();}catch(RuntimeException ignored){}motor=null;}}
}
