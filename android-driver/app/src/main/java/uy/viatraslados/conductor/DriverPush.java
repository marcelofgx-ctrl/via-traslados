package uy.viatraslados.conductor;

import android.app.*;
import android.content.*;
import android.os.Build;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

final class DriverPush {
    static final String ACTION="uy.viatraslados.conductor.NEW_REQUEST";
    static final String CHANNEL="via_driver_requests_v1";
    private static SharedPreferences prefs(Context c){return c.getSharedPreferences("via_driver_push_v1",Context.MODE_PRIVATE);}
    static synchronized String deviceId(Context c){
        String id=prefs(c).getString("device","");
        if(id.isEmpty()){id=java.util.UUID.randomUUID().toString();prefs(c).edit().putString("device",id).commit();}
        return id;
    }
    static boolean available(Context c,String actor){return actor!=null&&!actor.isEmpty()&&actor.equals(prefs(c).getString("actor",""))&&prefs(c).getBoolean("available",false);}
    static boolean active(Context c){return prefs(c).getBoolean("available",false);}
    static void setAvailable(Context c,String actor,boolean on){
        prefs(c).edit().putString("actor",actor).putBoolean("available",on).apply();
        if(!on){NotificationManager nm=c.getSystemService(NotificationManager.class);if(nm!=null)nm.cancelAll();}
    }
    static boolean init(Context c){
        if(BuildConfig.VIA_FIREBASE_APP_ID.isEmpty()||BuildConfig.VIA_FIREBASE_API_KEY.isEmpty()||BuildConfig.VIA_FIREBASE_PROJECT_ID.isEmpty()||BuildConfig.VIA_FIREBASE_SENDER_ID.isEmpty())return false;
        try{
            if(FirebaseApp.getApps(c).isEmpty())FirebaseApp.initializeApp(c,new FirebaseOptions.Builder().setApplicationId(BuildConfig.VIA_FIREBASE_APP_ID).setApiKey(BuildConfig.VIA_FIREBASE_API_KEY).setProjectId(BuildConfig.VIA_FIREBASE_PROJECT_ID).setGcmSenderId(BuildConfig.VIA_FIREBASE_SENDER_ID).build());
            return true;
        }catch(Exception e){return false;}
    }
    static void cancel(Context c,String id){NotificationManager nm=c.getSystemService(NotificationManager.class);if(nm!=null)nm.cancel(id,354);}
    static void notifyRequest(Context c,String id,String device){
        if(!active(c)||!deviceId(c).equals(device)||id==null||!id.matches("[A-Za-z0-9_-]{12,100}"))return;
        String actor=prefs(c).getString("actor","");
        if(c.getSharedPreferences("via_new_request_alerts_v351",Context.MODE_PRIVATE).getBoolean(RequestAlertQueue.key(actor,id),false))return;
        if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)return;
        NotificationManager nm=c.getSystemService(NotificationManager.class);if(nm==null||!nm.areNotificationsEnabled())return;
        NotificationChannel ch=new NotificationChannel(CHANNEL,"Nuevas solicitudes",NotificationManager.IMPORTANCE_HIGH);ch.enableVibration(true);nm.createNotificationChannel(ch);
        Intent open=new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi=PendingIntent.getActivity(c,354,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification n=new Notification.Builder(c,CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Vía Traslados").setContentText("Nueva solicitud de traslado").setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(pi).setAutoCancel(true).setOnlyAlertOnce(true).build();
        try{nm.notify(id,354,n);}catch(SecurityException ignored){}
        c.sendBroadcast(new Intent(ACTION).setPackage(c.getPackageName()));
    }
}
