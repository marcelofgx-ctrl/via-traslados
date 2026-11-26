package uy.viatraslados.conductor;

import android.app.*;
import android.content.*;
import android.os.*;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.view.*;
import android.widget.*;
import android.provider.Settings;
import org.json.*;
import java.util.concurrent.*;
import java.util.*;
import okhttp3.*;

/** Temporary production pilot, opt-in, session bearer only in RAM. No FCM or reservation writes. */
public final class RequestMonitorService extends Service {
    private static final String API="https://via-traslados-api.marcelof-gx.workers.dev/api/operator/requests";
    private static final String PREF="via_driver_monitor_v1",SEEN="via_new_request_alerts_v351",ONGOING="via_monitor_v1",ALERTS=AlertSignal.CHANNEL;
    private static final String STOP="uy.viatraslados.STOP_MONITOR";
    private static final int MONITOR_ID=3540,ALERT_ID=3541;
    private static volatile boolean foreground=false;
    private static volatile String activeActor="";
    private static volatile boolean running=false;
    private static volatile String state="reactivar externo";
    private static volatile RequestMonitorService instance;
    private final Handler ui=new Handler(Looper.getMainLooper());
    private View overlay;
    private String overlayId="";
    private final Runnable hidePopup=()->removeOverlay();
    static String status(){return state;}
    static boolean validBearer(String value){return value!=null&&!value.isEmpty()&&value.length()<=8192&&value.chars().noneMatch(ch->ch<=32||ch==127);}
    static void updateToken(String id,String value){RequestMonitorService service=instance;if(service!=null&&runningFor(id)&&validBearer(value))service.token=value;}
    private static volatile String nextActor="",nextToken="";
    private ScheduledExecutorService executor;
    private volatile boolean stopped=false;
    private String actor="";private volatile String token="";
    private final OkHttpClient client=new OkHttpClient.Builder().connectTimeout(10,TimeUnit.SECONDS).readTimeout(15,TimeUnit.SECONDS).callTimeout(20,TimeUnit.SECONDS).build();
    static void setForeground(boolean on){foreground=on;RequestMonitorService service=instance;if(on&&service!=null)service.ui.post(()->service.removeOverlay());}
    static boolean runningFor(String id){return running&&!id.isEmpty()&&id.equals(activeActor);}
    static android.content.SharedPreferences prefs(Context c){return c.getSharedPreferences(PREF,MODE_PRIVATE);}
    static boolean desired(Context c,String id){return id!=null&&!id.isEmpty()&&prefs(c).getBoolean("available_"+id,false);}
    static void setDesired(Context c,String id,boolean on){if(id!=null&&!id.isEmpty())prefs(c).edit().putBoolean("available_"+id,on).apply();}
    static void start(Context c,String id,String bearer){
        if(!BuildConfig.VIA_PRODUCTION||id==null||id.isEmpty()||!validBearer(bearer)){state="sesión no válida";return;}
        state="iniciando monitoreo";
        // Keep credentials out of Intent extras, saved state, logs and SharedPreferences.
        nextActor=id;nextToken=bearer;
        try{c.startForegroundService(new Intent(c,RequestMonitorService.class));}
        catch(RuntimeException e){state="inicio restringido por Android";nextActor="";nextToken="";throw e;}
    }
    static void stop(Context c){state="reactivar externo";nextActor="";nextToken="";c.stopService(new Intent(c,RequestMonitorService.class));}
    static void stopIfOther(Context c,String id){if(running&&!activeActor.equals(id)){stop(c);clearAlerts(c);}}
    static String tag(String actor,String id){return "via_req_"+actor+"_"+id;}
    static void cancelAlert(Context c,String actor,String id){NotificationManager n=c.getSystemService(NotificationManager.class);if(n!=null)n.cancel(tag(actor,id),ALERT_ID);}
    static void clearAlerts(Context c){NotificationManager n=c.getSystemService(NotificationManager.class);if(n!=null)for(android.service.notification.StatusBarNotification a:n.getActiveNotifications())if(a.getId()==ALERT_ID)n.cancel(a.getTag(),ALERT_ID);}
    @Override public void onCreate(){super.onCreate();instance=this;}
    @Override public IBinder onBind(Intent intent){return null;}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent!=null&&STOP.equals(intent.getAction())){setDesired(this,actor,false);clearAlerts(this);shutdown();return START_NOT_STICKY;}
        final String a=nextActor,t=nextToken;nextActor="";nextToken="";
        if(!BuildConfig.VIA_PRODUCTION||a.isEmpty()||!validBearer(t)||!desired(this,a)){state="sesión no disponible";shutdown();return START_NOT_STICKY;}
        if(executor!=null)executor.shutdownNow();
        actor=a;token=t;stopped=false;activeActor=a;
        NotificationManager nm=getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(ONGOING,"Disponibilidad de Vía Traslados",NotificationManager.IMPORTANCE_LOW));
        AlertSignal.ensureChannel(this);
        PendingIntent stop=PendingIntent.getService(this,3540,new Intent(this,RequestMonitorService.class).setAction(STOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        Notification ongoing=new Notification.Builder(this,ONGOING).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Vía Traslados · Disponible")
          .setContentText("Monitoreo de solicitudes activo").setContentIntent(open()).setOngoing(true).setVisibility(Notification.VISIBILITY_PRIVATE)
          .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"No disponible",stop).build()).build();
        try{startForeground(MONITOR_ID,ongoing);running=true;state="activo";}
        catch(RuntimeException e){state="servicio restringido por Android";shutdown();return START_NOT_STICKY;}
        executor=Executors.newSingleThreadScheduledExecutor();
        executor.scheduleWithFixedDelay(()->poll(a),2,25,TimeUnit.SECONDS);
        return START_NOT_STICKY;
    }
    private PendingIntent open(){return PendingIntent.getActivity(this,3541,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);}
    private boolean valid(String a){return !stopped&&running&&a.equals(activeActor)&&desired(this,a);}
    private void poll(String a){
        if(!valid(a)||foreground)return;
        String t=token;
        try(Response r=client.newCall(new Request.Builder().url(API).header("Authorization","Bearer "+t).header("Accept","application/json").header("Cache-Control","no-cache").build()).execute()){
            if(!valid(a)||foreground)return;
            if(r.code()==401||r.code()==403){if(!t.equals(token))return;ui.post(()->{if(valid(a)&&t.equals(token)){state="sesión expirada · volver a ingresar";shutdown();}});return;}
            if(!r.isSuccessful()||r.body()==null||r.body().contentLength()>2000000)return;
            String raw=r.body().string();if(raw.length()>2000000)return;
            JSONArray rows=new JSONArray(raw);
            android.content.SharedPreferences seen=getSharedPreferences(SEEN,MODE_PRIVATE),posted=getSharedPreferences("via_alert_posted_v1",MODE_PRIVATE);
            NotificationManager nm=getSystemService(NotificationManager.class);if(nm==null||!nm.areNotificationsEnabled())return;
            if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)return;
            Set<String> eligible=new HashSet<>();
            List<JSONObject> sorted=new ArrayList<>();
            for(int i=0;i<rows.length();i++){JSONObject item=rows.optJSONObject(i);if(item!=null)sorted.add(item);}
            sorted.sort((left,right)->right.optString("created_at").compareTo(left.optString("created_at")));
            boolean emitted=false;
            for(JSONObject x:sorted){if(x==null||!"requested".equals(x.optString("status"))||!x.optBoolean("canQuote",false))continue;
                String id=x.optString("id","");if(!id.matches("[A-Za-z0-9_-]{12,100}"))continue;
                String key=RequestAlertQueue.key(a,id);eligible.add(tag(a,id));
                if(!valid(a)||foreground)return;
                if(seen.getBoolean(key,false)){cancelAlert(this,a,id);continue;}
                if(posted.getBoolean(key,false)||emitted)continue;
                NotificationChannel channel=nm.getNotificationChannel(ALERTS);
                if(channel==null||channel.getImportance()==NotificationManager.IMPORTANCE_NONE)continue;
                Notification.Builder builder=new Notification.Builder(this,ALERTS).setSmallIcon(R.drawable.driver_icon)
                  .setContentTitle("Vía Traslados · Nueva solicitud").setContentText("Hay un traslado pendiente de revisar.")
                  .setCategory(Notification.CATEGORY_EVENT).setContentIntent(open()).setAutoCancel(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE);
                if(AlertSignal.wasSounded(this,key))builder.setSilent(true);
                nm.notify(tag(a,id),ALERT_ID,builder.build());posted.edit().putBoolean(key,true).apply();
                AlertSignal.markSounded(this,key);emitted=true;
                ui.post(()->showOverlay(a,id,key));
            }
            for(android.service.notification.StatusBarNotification n:nm.getActiveNotifications())
                if(n.getId()==ALERT_ID&&n.getTag()!=null&&n.getTag().startsWith("via_req_"+a+"_")&&!eligible.contains(n.getTag()))nm.cancel(n.getTag(),ALERT_ID);
        }catch(Exception ignored){/* reconnect on next bounded poll; no secrets or request data in logs */}
    }
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private GradientDrawable shape(int color,int corner){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(corner));return d;}
    private TextView label(String value,int size,int color,boolean bold){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);if(bold)t.setTypeface(null,android.graphics.Typeface.BOLD);return t;}
    private void showOverlay(String a,String id,String key){
        if(!valid(a)||foreground||!Settings.canDrawOverlays(this)||getSharedPreferences(SEEN,MODE_PRIVATE).getBoolean(key,false))return;
        KeyguardManager kg=getSystemService(KeyguardManager.class);
        PowerManager pm=getSystemService(PowerManager.class);
        NotificationManager nm=getSystemService(NotificationManager.class);
        if(kg==null||kg.isKeyguardLocked()||pm==null||!pm.isInteractive()||nm==null||nm.getCurrentInterruptionFilter()!=NotificationManager.INTERRUPTION_FILTER_ALL)return;
        if(overlay!=null)return;
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(15),dp(12),dp(15),dp(12));
        box.setBackground(shape(0xfff9fcfa,18));box.setElevation(dp(10));
        box.addView(label("VÍA TRASLADOS",11,0xff086361,true));
        box.addView(label("Nueva solicitud de traslado",17,0xff193334,true));
        box.addView(label("Tenés una solicitud pendiente de revisar.",13,0xff506361,false));
        LinearLayout actions=new LinearLayout(this);actions.setPadding(0,dp(8),0,0);
        TextView seen=label("Visto",14,0xff086361,true);seen.setGravity(Gravity.CENTER);seen.setBackground(shape(0xffe6efeb,10));
        actions.addView(seen,new LinearLayout.LayoutParams(0,dp(44),1));
        TextView open=label("Abrir",14,Color.WHITE,true);open.setGravity(Gravity.CENTER);open.setBackground(shape(0xff086361,10));
        LinearLayout.LayoutParams op=new LinearLayout.LayoutParams(0,dp(44),1);op.leftMargin=dp(8);actions.addView(open,op);box.addView(actions);
        seen.setOnClickListener(v->{if(valid(a)){getSharedPreferences(SEEN,MODE_PRIVATE).edit().putBoolean(key,true).apply();cancelAlert(this,a,id);}removeOverlay();});
        open.setOnClickListener(v->{removeOverlay();try{open().send();}catch(PendingIntent.CanceledException ignored){}});
        WindowManager wm=getSystemService(WindowManager.class);
        if(wm==null)return;
        WindowManager.LayoutParams lp=new WindowManager.LayoutParams(Math.min(dp(360),getResources().getDisplayMetrics().widthPixels-dp(24)),WindowManager.LayoutParams.WRAP_CONTENT,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,PixelFormat.TRANSLUCENT);
        lp.gravity=Gravity.TOP|Gravity.CENTER_HORIZONTAL;lp.y=dp(44);
        try{wm.addView(box,lp);overlay=box;overlayId=id;ui.removeCallbacks(hidePopup);ui.postDelayed(hidePopup,12000);}catch(RuntimeException ignored){}
    }
    private void removeOverlay(){ui.removeCallbacks(hidePopup);View old=overlay;overlay=null;overlayId="";if(old!=null){try{WindowManager wm=getSystemService(WindowManager.class);if(wm!=null)wm.removeViewImmediate(old);}catch(RuntimeException ignored){}}}
    private void shutdown(){stopped=true;running=false;activeActor="";token="";nextToken="";nextActor="";removeOverlay();if(executor!=null)executor.shutdownNow();client.dispatcher().cancelAll();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    @Override public void onTimeout(int startId,int fgsType){state="límite Android · reactivar externo";shutdown();}
    @Override public void onDestroy(){stopped=true;running=false;activeActor="";token="";removeOverlay();if(instance==this)instance=null;if(executor!=null)executor.shutdownNow();client.dispatcher().cancelAll();super.onDestroy();}
}
