package uy.viatraslados.conductor;

import android.app.*;
import android.content.*;
import android.os.*;
import org.json.*;
import java.util.concurrent.*;
import java.util.*;
import okhttp3.*;

/** Temporary production pilot, opt-in, session bearer only in RAM. No FCM or reservation writes. */
public final class RequestMonitorService extends Service {
    private static final String API="https://via-traslados-api.marcelof-gx.workers.dev/api/operator/requests";
    private static final String PREF="via_driver_monitor_v1",SEEN="via_new_request_alerts_v351",ONGOING="via_monitor_v1",ALERTS="via_new_requests_v1";
    private static final String STOP="uy.viatraslados.STOP_MONITOR";
    private static final int MONITOR_ID=3540,ALERT_ID=3541;
    private static volatile boolean foreground=false;
    private static volatile String activeActor="";
    private static volatile boolean running=false;
    private static volatile String nextActor="",nextToken="";
    private ScheduledExecutorService executor;
    private volatile boolean stopped=false;
    private String actor="",token="";
    private final OkHttpClient client=new OkHttpClient.Builder().connectTimeout(10,TimeUnit.SECONDS).readTimeout(15,TimeUnit.SECONDS).callTimeout(20,TimeUnit.SECONDS).build();
    static void setForeground(boolean on){foreground=on;}
    static boolean runningFor(String id){return running&&!id.isEmpty()&&id.equals(activeActor);}
    static android.content.SharedPreferences prefs(Context c){return c.getSharedPreferences(PREF,MODE_PRIVATE);}
    static boolean desired(Context c,String id){return id!=null&&!id.isEmpty()&&prefs(c).getBoolean("available_"+id,false);}
    static void setDesired(Context c,String id,boolean on){if(id!=null&&!id.isEmpty())prefs(c).edit().putBoolean("available_"+id,on).apply();}
    static void start(Context c,String id,String bearer){
        if(!BuildConfig.VIA_PRODUCTION||id.isEmpty()||bearer==null||!bearer.matches("[a-fA-F0-9]{64}"))return;
        // Keep credentials out of Intent extras, saved state, logs and SharedPreferences.
        nextActor=id;nextToken=bearer;
        try{c.startForegroundService(new Intent(c,RequestMonitorService.class));}
        catch(RuntimeException e){nextActor="";nextToken="";throw e;}
    }
    static void stop(Context c){nextActor="";nextToken="";c.stopService(new Intent(c,RequestMonitorService.class));}
    static void stopIfOther(Context c,String id){if(running&&!activeActor.equals(id)){stop(c);clearAlerts(c);}}
    static String tag(String actor,String id){return "via_req_"+actor+"_"+id;}
    static void cancelAlert(Context c,String actor,String id){NotificationManager n=c.getSystemService(NotificationManager.class);if(n!=null)n.cancel(tag(actor,id),ALERT_ID);}
    static void clearAlerts(Context c){NotificationManager n=c.getSystemService(NotificationManager.class);if(n!=null)for(android.service.notification.StatusBarNotification a:n.getActiveNotifications())if(a.getId()==ALERT_ID)n.cancel(a.getTag(),ALERT_ID);}
    @Override public IBinder onBind(Intent intent){return null;}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent!=null&&STOP.equals(intent.getAction())){setDesired(this,actor,false);clearAlerts(this);shutdown();return START_NOT_STICKY;}
        final String a=nextActor,t=nextToken;nextActor="";nextToken="";
        if(!BuildConfig.VIA_PRODUCTION||a.isEmpty()||t.isEmpty()||!desired(this,a)){shutdown();return START_NOT_STICKY;}
        if(executor!=null)executor.shutdownNow();
        actor=a;token=t;stopped=false;activeActor=a;
        NotificationManager nm=getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(ONGOING,"Disponibilidad de Vía Traslados",NotificationManager.IMPORTANCE_LOW));
        NotificationChannel alerts=new NotificationChannel(ALERTS,"Nuevas solicitudes",NotificationManager.IMPORTANCE_HIGH);
        alerts.enableVibration(true);nm.createNotificationChannel(alerts);
        PendingIntent stop=PendingIntent.getService(this,3540,new Intent(this,RequestMonitorService.class).setAction(STOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        Notification ongoing=new Notification.Builder(this,ONGOING).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Vía Traslados · Disponible")
          .setContentText("Monitoreo de solicitudes activo").setContentIntent(open()).setOngoing(true).setVisibility(Notification.VISIBILITY_PRIVATE)
          .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"No disponible",stop).build()).build();
        try{startForeground(MONITOR_ID,ongoing);running=true;}
        catch(RuntimeException e){shutdown();return START_NOT_STICKY;}
        executor=Executors.newSingleThreadScheduledExecutor();
        executor.scheduleWithFixedDelay(()->poll(a,t),2,45,TimeUnit.SECONDS);
        return START_NOT_STICKY;
    }
    private PendingIntent open(){return PendingIntent.getActivity(this,3541,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);}
    private boolean valid(String a){return !stopped&&running&&a.equals(activeActor)&&desired(this,a);}
    private void poll(String a,String t){
        if(!valid(a)||foreground)return;
        try(Response r=client.newCall(new Request.Builder().url(API).header("Authorization","Bearer "+t).header("Accept","application/json").header("Cache-Control","no-cache").build()).execute()){
            if(!valid(a)||foreground)return;
            if(r.code()==401||r.code()==403){new Handler(Looper.getMainLooper()).post(()->{if(valid(a))shutdown();});return;}
            if(!r.isSuccessful()||r.body()==null||r.body().contentLength()>2000000)return;
            String raw=r.body().string();if(raw.length()>2000000)return;
            JSONArray rows=new JSONArray(raw);
            android.content.SharedPreferences seen=getSharedPreferences(SEEN,MODE_PRIVATE),posted=getSharedPreferences("via_alert_posted_v1",MODE_PRIVATE);
            NotificationManager nm=getSystemService(NotificationManager.class);if(nm==null||!nm.areNotificationsEnabled())return;
            if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)return;
            Set<String> eligible=new HashSet<>();
            for(int i=0;i<rows.length();i++){
                JSONObject x=rows.optJSONObject(i);if(x==null||!"requested".equals(x.optString("status"))||!x.optBoolean("canQuote",false))continue;
                String id=x.optString("id","");if(!id.matches("[A-Za-z0-9_-]{12,100}"))continue;
                String key=RequestAlertQueue.key(a,id);eligible.add(tag(a,id));
                if(!valid(a)||foreground)return;
                if(seen.getBoolean(key,false)){cancelAlert(this,a,id);continue;}
                if(posted.getBoolean(key,false))continue;
                Notification note=new Notification.Builder(this,ALERTS).setSmallIcon(android.R.drawable.ic_dialog_info)
                  .setContentTitle("Vía Traslados · Nueva solicitud").setContentText("Abrí la aplicación para revisar el traslado.")
                  .setContentIntent(open()).setAutoCancel(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE).build();
                nm.notify(tag(a,id),ALERT_ID,note);posted.edit().putBoolean(key,true).apply();
            }
            for(android.service.notification.StatusBarNotification n:nm.getActiveNotifications())
                if(n.getId()==ALERT_ID&&n.getTag()!=null&&n.getTag().startsWith("via_req_"+a+"_")&&!eligible.contains(n.getTag()))nm.cancel(n.getTag(),ALERT_ID);
        }catch(Exception ignored){/* reconnect on next bounded poll; no secrets or request data in logs */}
    }
    private void shutdown(){stopped=true;running=false;activeActor="";token="";nextToken="";nextActor="";if(executor!=null)executor.shutdownNow();client.dispatcher().cancelAll();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    @Override public void onTimeout(int startId,int fgsType){shutdown();}
    @Override public void onDestroy(){stopped=true;running=false;activeActor="";token="";if(executor!=null)executor.shutdownNow();client.dispatcher().cancelAll();super.onDestroy();}
}
