package uy.viatraslados.conductor;

import android.app.*;
import android.content.*;
import android.media.*;
import android.net.Uri;
import android.os.*;

/** Repeated alert cycles until acknowledged, honoring notification settings. */
final class AlertSignal {
    static final String CHANNEL="via_new_requests_premium_v2";
    private static final String SIGNALS="via_alert_signal_v2",POSTED="via_alert_posted_v1";
    private static final long[] PULSE={0,1300,200,1300,200,1300,200,1100};
    private static final long CYCLE_MS=6500;
    private static final Handler SIGNAL_HANDLER=new Handler(Looper.getMainLooper());
    private static Runnable repeat;
    private static Context signalContext;
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
        stop(c);
        signalContext=c.getApplicationContext();
        repeat=new Runnable(){@Override public void run(){
            Context ctx=signalContext;if(repeat!=this||ctx==null)return;
            if(!playCycle(ctx)){stop(ctx);return;}
            SIGNAL_HANDLER.postDelayed(this,CYCLE_MS);
        }};
        repeat.run();
    }
    private static boolean playCycle(Context c){
        ensureChannel(c);NotificationManager nm=c.getSystemService(NotificationManager.class);
        if(nm==null||!nm.areNotificationsEnabled()||nm.getCurrentInterruptionFilter()!=NotificationManager.INTERRUPTION_FILTER_ALL)return false;
        NotificationChannel ch=nm.getNotificationChannel(CHANNEL);
        if(ch==null||ch.getImportance()<NotificationManager.IMPORTANCE_DEFAULT)return false;
        AudioManager audio=c.getSystemService(AudioManager.class);
        if(audio==null||audio.getRingerMode()==AudioManager.RINGER_MODE_SILENT)return false;
        stopOutputs();
        boolean active=false;
        if(audio.getRingerMode()==AudioManager.RINGER_MODE_NORMAL&&ch.getSound()!=null&&audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION)>0){
            try{tone=RingtoneManager.getRingtone(c,ch.getSound());if(tone==null)tone=RingtoneManager.getRingtone(c,android.provider.Settings.System.DEFAULT_NOTIFICATION_URI);if(tone!=null){tone.setAudioAttributes(attrs());tone.play();active=true;}}catch(RuntimeException ignored){}
        }
        if(ch.shouldVibrate()){
            try{if(Build.VERSION.SDK_INT>=31){VibratorManager vm=c.getSystemService(VibratorManager.class);motor=vm==null?null:vm.getDefaultVibrator();}else motor=c.getSystemService(Vibrator.class);
                if(motor!=null&&motor.hasVibrator()){motor.vibrate(VibrationEffect.createWaveform(PULSE,-1),attrs());active=true;}
            }catch(RuntimeException ignored){}
        }
        return active;
    }
    private static void stopOutputs(){if(tone!=null){try{tone.stop();}catch(RuntimeException ignored){}tone=null;}if(motor!=null){try{motor.cancel();}catch(RuntimeException ignored){}motor=null;}}
    static void stop(Context c){if(repeat!=null)SIGNAL_HANDLER.removeCallbacks(repeat);repeat=null;signalContext=null;stopOutputs();}
}
