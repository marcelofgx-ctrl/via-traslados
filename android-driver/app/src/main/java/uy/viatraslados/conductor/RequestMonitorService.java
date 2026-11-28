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
    private static final String API=(BuildConfig.VIA_DRIVER_PROFILE_QA?"https://via-traslados-api-v36-qa.marcelof-gx.workers.dev":"https://via-traslados-api.marcelof-gx.workers.dev")+"/api/operator/requests";
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
    private TextView overlayTitle,tabTitle,arrow;
    private long repeatUntil=0;
    private boolean replaying=false;
    private final Runnable repeatSignal=()->repeatExternalSignal();
    private LinearLayout overlayBody;
    private WindowManager.LayoutParams overlayParams;
    private int latestPending=0;
    private boolean collapsed=false;
    private static final String REVIEW="uy.viatraslados.REVIEW_REQUESTS";
    static boolean reviewIntent(Intent i){return i!=null&&REVIEW.equals(i.getAction());}
    private String batchTag(String a){return "via_batch_"+a;}

    static String status(){return state;}
    static boolean validBearer(String value){return value!=null&&!value.isEmpty()&&value.length()<=8192&&value.chars().noneMatch(ch->ch<=32||ch==127);}
    static void updateToken(String id,String value){RequestMonitorService service=instance;if(service!=null&&runningFor(id)&&validBearer(value))service.token=value;}
    private static volatile String nextActor="",nextToken="";
    private ScheduledExecutorService executor;
    private volatile boolean stopped=false;
    private String actor="";private volatile String token="";
    private final OkHttpClient client=new OkHttpClient.Builder().connectTimeout(10,TimeUnit.SECONDS).readTimeout(15,TimeUnit.SECONDS).callTimeout(20,TimeUnit.SECONDS).build();
    static void setForeground(boolean on){foreground=on;RequestMonitorService service=instance;if(on&&service!=null)service.ui.post(()->{service.latestPending=0;service.removeOverlay();clearAlerts(service);});}
    static boolean runningFor(String id){return running&&!id.isEmpty()&&id.equals(activeActor);}
    static android.content.SharedPreferences prefs(Context c){return c.getSharedPreferences(PREF,MODE_PRIVATE);}
    static boolean desired(Context c,String id){return id!=null&&!id.isEmpty()&&prefs(c).getBoolean("available_"+id,false);}
    static boolean autoOpen(Context c,String id){return id!=null&&!id.isEmpty()&&prefs(c).getBoolean("auto_open_"+id,false);}
    static void setAutoOpen(Context c,String id,boolean on){if(id!=null&&!id.isEmpty())prefs(c).edit().putBoolean("auto_open_"+id,on).apply();}
    static void setDesired(Context c,String id,boolean on){if(id!=null&&!id.isEmpty())prefs(c).edit().putBoolean("available_"+id,on).apply();}
    static void start(Context c,String id,String bearer){
        if(!(BuildConfig.VIA_PRODUCTION||BuildConfig.VIA_DRIVER_PROFILE_QA)||id==null||id.isEmpty()||!validBearer(bearer)){state="sesión no válida";return;}
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
        if(!(BuildConfig.VIA_PRODUCTION||BuildConfig.VIA_DRIVER_PROFILE_QA)||a.isEmpty()||!validBearer(t)||!desired(this,a)){state="sesión no disponible";shutdown();return START_NOT_STICKY;}
        if(executor!=null)executor.shutdownNow();
        actor=a;token=t;stopped=false;activeActor=a;
        NotificationManager nm=getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(ONGOING,"Disponibilidad de Vía Traslados",NotificationManager.IMPORTANCE_LOW));
        AlertSignal.ensureChannel(this);
        NotificationChannel quiet=new NotificationChannel("via_requests_quiet_v2","Solicitudes ya avisadas",NotificationManager.IMPORTANCE_LOW);quiet.setSound(null,null);quiet.enableVibration(false);nm.createNotificationChannel(quiet);
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
    private PendingIntent open(){return PendingIntent.getActivity(this,3541,new Intent(this,MainActivity.class).setAction(REVIEW).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);}
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
            List<RequestAlertQueue.Entry> entries=new ArrayList<>();
            for(int i=0;i<rows.length();i++){
                JSONObject x=rows.optJSONObject(i);
                if(x==null||!"requested".equals(x.optString("status"))||!x.optBoolean("canQuote",false))continue;
                String id=x.optString("id","");
                if(id.matches("[A-Za-z0-9_-]{12,100}"))entries.add(new RequestAlertQueue.Entry(id,x.optString("created_at")));
            }
            RequestAlertQueue.Batch batch=RequestAlertQueue.batch(entries,id->seen.getBoolean(RequestAlertQueue.key(a,id),false),id->posted.getBoolean(RequestAlertQueue.key(a,id),false));
            if(!valid(a)||foreground)return;
            // Retire individual notifications left by earlier versions. Only one summary per account.
            for(android.service.notification.StatusBarNotification n:nm.getActiveNotifications())
                if(n.getId()==ALERT_ID&&n.getTag()!=null&&n.getTag().startsWith("via_req_"+a+"_"))nm.cancel(n.getTag(),ALERT_ID);
            if(batch.pending==0){nm.cancel(batchTag(a),ALERT_ID);ui.post(()->{if(valid(a)){latestPending=0;removeOverlay();}});return;}
            boolean alreadyActive=false;
            for(android.service.notification.StatusBarNotification n:nm.getActiveNotifications())
                if(n.getId()==ALERT_ID&&batchTag(a).equals(n.getTag()))alreadyActive=true;
            NotificationChannel channel=nm.getNotificationChannel(ALERTS);
            if(channel==null||channel.getImportance()==NotificationManager.IMPORTANCE_NONE)return;
            boolean audible=false;
            for(String id:batch.unannounced)if(!AlertSignal.wasSounded(this,RequestAlertQueue.key(a,id)))audible=true;
            String heading=batch.pending==1?"Nueva solicitud de traslado":batch.pending+" solicitudes pendientes";
            // A new batch replaces the previous summary, allowing one sound per batch.
            // Ordinary refreshes preserve the active notification and do not sound again.
            if(!batch.unannounced.isEmpty()||alreadyActive){
                if(audible)nm.cancel(batchTag(a),ALERT_ID);
                String notificationChannel=audible?ALERTS:"via_requests_quiet_v2";
                if(!audible&&alreadyActive&&batch.unannounced.isEmpty()){
                    for(android.service.notification.StatusBarNotification n:nm.getActiveNotifications())
                        if(n.getId()==ALERT_ID&&batchTag(a).equals(n.getTag()))notificationChannel=n.getNotification().getChannelId();
                }
                Notification note=new Notification.Builder(this,notificationChannel).setSmallIcon(R.drawable.driver_icon)
                    .setContentTitle("Vía Traslados · "+heading).setContentText("Abrí la aplicación para revisar los traslados.")
                    .setCategory(Notification.CATEGORY_EVENT).setContentIntent(open()).setAutoCancel(true)
                    .setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE).build();
                if(!valid(a)||foreground)return;
                nm.notify(batchTag(a),ALERT_ID,note);
                android.content.SharedPreferences.Editor edit=posted.edit();
                for(String id:batch.unannounced){String key=RequestAlertQueue.key(a,id);edit.putBoolean(key,true);AlertSignal.markSounded(this,key);}
                edit.apply();
            }
            ui.post(()->{if(valid(a)&&!foreground){latestPending=batch.pending;if(!canPresent(a)){removeOverlay();return;}if(!batch.unannounced.isEmpty())presentBatch(a,batch.pending);else updateOverlay(batch.pending);}});
        }catch(Exception ignored){/* reconnect on next bounded poll; no secrets or request data in logs */}
    }
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private GradientDrawable shape(int color,int corner){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(corner));return d;}
    private TextView label(String value,int size,int color,boolean bold){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);if(bold)t.setTypeface(null,android.graphics.Typeface.BOLD);return t;}
    private void updateOverlay(int count){
        if(overlay==null)return;
        if(count<=0){removeOverlay();return;}
        overlayTitle.setText(count==1?"Nuevo traslado":"Nuevos traslados");
        tabTitle.setText(count==1?"1 solicitud pendiente":count+" solicitudes pendientes");
        arrow.setText(collapsed?"⌃":"⌄");
        arrow.setContentDescription(collapsed?"Expandir aviso":"Minimizar aviso");
    }
    private void startExternalRepeat(){
        stopExternalRepeat();
        // The Android notification already plays the first premium sequence.
        repeatUntil=SystemClock.elapsedRealtime()+30000;
        ui.postDelayed(repeatSignal,6200);
    }
    private void repeatExternalSignal(){
        if(overlay==null||collapsed||!canPresent(actor)||SystemClock.elapsedRealtime()>=repeatUntil){stopExternalRepeat();return;}
        replaying=AlertSignal.replayExternal(this);
        if(replaying)ui.postDelayed(repeatSignal,6200);
    }
    private void stopExternalRepeat(){
        repeatUntil=0;ui.removeCallbacks(repeatSignal);
        if(replaying){AlertSignal.stop(this);replaying=false;}
    }
    private boolean canPresent(String a){
        if(!valid(a)||foreground||!Settings.canDrawOverlays(this))return false;
        KeyguardManager kg=getSystemService(KeyguardManager.class);PowerManager pm=getSystemService(PowerManager.class);
        NotificationManager nm=getSystemService(NotificationManager.class);
        return kg!=null&&!kg.isKeyguardLocked()&&pm!=null&&pm.isInteractive()&&nm!=null&&nm.getCurrentInterruptionFilter()==NotificationManager.INTERRUPTION_FILTER_ALL;
    }
    private void presentBatch(String a,int count){
        if(!canPresent(a)||count<=0)return;
        if(!autoOpen(this,a)){showOverlay(a,count);return;}
        try{startActivity(new Intent(this,MainActivity.class).setAction(REVIEW).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP));}
        catch(RuntimeException e){showOverlay(a,count);return;}
        // Android can silently deny a background start. Keep the approved sheet as fallback.
        ui.postDelayed(()->{if(valid(a)&&!foreground&&latestPending>0)showOverlay(a,latestPending);},900);
    }
    private int measureOverlayHeight(View view,WindowManager wm){
        int width=view.getWidth();
        if(width<=0){
            if(Build.VERSION.SDK_INT>=30){
                WindowMetrics metrics=wm.getCurrentWindowMetrics();
                android.graphics.Insets in=metrics.getWindowInsets().getInsetsIgnoringVisibility(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
                width=metrics.getBounds().width()-in.left-in.right;
            }else width=getResources().getDisplayMetrics().widthPixels;
        }
        view.measure(View.MeasureSpec.makeMeasureSpec(Math.max(dp(120),width),View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED));
        return Math.max(dp(56),view.getMeasuredHeight());
    }
    private void setCollapsed(boolean value){
        if(overlay==null||overlayBody==null||overlayParams==null)return;
        stopExternalRepeat();
        collapsed=value;overlayBody.setVisibility(value?View.GONE:View.VISIBLE);
        updateOverlay(latestPending);
        if(overlay==null)return;
        try{
            WindowManager wm=getSystemService(WindowManager.class);
            if(wm==null){removeOverlay();return;}
            // Explicit pixel height forces WindowManager to resize the real touchable area.
            overlay.requestLayout();
            overlayParams.height=measureOverlayHeight(overlay,wm);
            wm.updateViewLayout(overlay,overlayParams);
        }catch(RuntimeException e){removeOverlay();}
    }
    private void attachTabGesture(View... targets){
        final View.OnTouchListener touch=new View.OnTouchListener(){
            float downY,downX;boolean consumed;
            @Override public boolean onTouch(View v,MotionEvent e){
                switch(e.getActionMasked()){
                    case MotionEvent.ACTION_DOWN:downY=e.getRawY();downX=e.getRawX();consumed=false;return true;
                    case MotionEvent.ACTION_MOVE:
                    case MotionEvent.ACTION_UP:
                        if(!consumed){
                            int action=OverlayGesture.resolve(e.getRawY()-downY,e.getRawX()-downX,dp(14),e.getActionMasked()==MotionEvent.ACTION_UP);
                            if(action!=OverlayGesture.NONE){
                                consumed=true;
                                if(action==OverlayGesture.TOGGLE)v.performClick();
                                else setCollapsed(action==OverlayGesture.COLLAPSE);
                            }
                        }
                        return true;
                    case MotionEvent.ACTION_CANCEL:consumed=true;return true;
                    default:return true;
                }
            }
        };
        for(View v:targets){
            v.setOnClickListener(view->setCollapsed(!collapsed));v.setOnTouchListener(touch);
        }
    }
    private void showOverlay(String a,int count){
        if(!canPresent(a)||count<=0)return;
        latestPending=count;
        if(overlay!=null){setCollapsed(false);startExternalRepeat();return;}
        collapsed=false;
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(12),dp(5),dp(12),dp(9));
        GradientDrawable satin=new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{Color.WHITE,0xfff5faf7});
        satin.setCornerRadii(new float[]{dp(19),dp(19),dp(19),dp(19),0,0,0,0});satin.setStroke(dp(1),0xffd9e3df);
        box.setBackground(satin);box.setElevation(dp(5));
        LinearLayout gripZone=new LinearLayout(this);gripZone.setGravity(Gravity.CENTER);
        View grip=new View(this);grip.setBackground(shape(0xffb7c7bf,3));gripZone.addView(grip,new LinearLayout.LayoutParams(dp(30),dp(3)));
        box.addView(gripZone,new LinearLayout.LayoutParams(-1,dp(10)));
        LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);
        FrameLayout bellBox=new FrameLayout(this);bellBox.setBackground(shape(0xffe6f2ec,10));
        AlertGlyph bell=new AlertGlyph(this,"bell",0xff086361);bellBox.addView(bell,new FrameLayout.LayoutParams(dp(22),dp(22),Gravity.CENTER));
        header.addView(bellBox,new LinearLayout.LayoutParams(dp(35),dp(35)));
        LinearLayout words=new LinearLayout(this);words.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams wp=new LinearLayout.LayoutParams(0,-2,1);wp.leftMargin=dp(9);header.addView(words,wp);
        overlayTitle=label("",16,0xff193334,true);words.addView(overlayTitle);
        tabTitle=label("",12,0xff59776e,false);words.addView(tabTitle);
        arrow=label("⌄",24,0xff086361,true);arrow.setGravity(Gravity.CENTER);header.addView(arrow,new LinearLayout.LayoutParams(dp(44),dp(44)));
        TextView close=label("×",24,0xff778b81,false);close.setGravity(Gravity.CENTER);close.setContentDescription("Cerrar aviso sin marcar solicitud como vista");
        header.addView(close,new LinearLayout.LayoutParams(dp(44),dp(44)));close.setOnClickListener(v->removeOverlay());
        box.addView(header,new LinearLayout.LayoutParams(-1,-2));
        attachTabGesture(gripZone,header,bellBox,words,overlayTitle,tabTitle,arrow);
        LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);overlayBody=body;
        LinearLayout actions=new LinearLayout(this);actions.setPadding(0,dp(6),0,0);
        TextView later=label("Ahora no",14,0xff086361,true);later.setGravity(Gravity.CENTER);
        GradientDrawable secondary=shape(Color.WHITE,11);secondary.setStroke(dp(1),0xffc6d9cf);later.setBackground(secondary);
        actions.addView(later,new LinearLayout.LayoutParams(0,dp(46),1));
        TextView open=label("Ver solicitudes  ›",14,Color.WHITE,true);open.setGravity(Gravity.CENTER);open.setBackground(shape(0xff086361,11));
        LinearLayout.LayoutParams op=new LinearLayout.LayoutParams(0,dp(46),2);op.leftMargin=dp(8);actions.addView(open,op);
        body.addView(actions);box.addView(body,new LinearLayout.LayoutParams(-1,-2));
        later.setOnClickListener(v->setCollapsed(true));
        open.setOnClickListener(v->{
            stopExternalRepeat();
            if(!valid(a)){removeOverlay();return;}
            try{startActivity(new Intent(this,MainActivity.class).setAction(REVIEW).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP));}
            catch(RuntimeException e){try{open().send();}catch(PendingIntent.CanceledException ignored){}}
        });
        WindowManager wm=getSystemService(WindowManager.class);if(wm==null)return;
        WindowManager.LayoutParams lp=new WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT,WindowManager.LayoutParams.WRAP_CONTENT,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,PixelFormat.TRANSLUCENT);
        lp.gravity=Gravity.BOTTOM|Gravity.CENTER_HORIZONTAL;lp.y=dp(3);
        if(Build.VERSION.SDK_INT>=30){lp.setFitInsetsTypes(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());lp.setFitInsetsSides(WindowInsets.Side.all());lp.setFitInsetsIgnoringVisibility(true);}
        overlay=box;overlayParams=lp;updateOverlay(count);
        try{lp.height=measureOverlayHeight(box,wm);wm.addView(box,lp);startExternalRepeat();}
        catch(RuntimeException e){removeOverlay();}
    }
    private void removeOverlay(){
        stopExternalRepeat();View old=overlay;overlay=null;overlayTitle=null;tabTitle=null;arrow=null;overlayBody=null;overlayParams=null;collapsed=false;
        if(old!=null){try{WindowManager wm=getSystemService(WindowManager.class);if(wm!=null)wm.removeViewImmediate(old);}catch(RuntimeException ignored){}}
    }
    @Override public void onTaskRemoved(Intent rootIntent){removeOverlay();latestPending=0;super.onTaskRemoved(rootIntent);}
    @Override public void onConfigurationChanged(android.content.res.Configuration config){
        super.onConfigurationChanged(config);if(overlay!=null)setCollapsed(collapsed);
    }
    private void shutdown(){stopped=true;running=false;activeActor="";token="";nextToken="";nextActor="";removeOverlay();if(executor!=null)executor.shutdownNow();client.dispatcher().cancelAll();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    @Override public void onTimeout(int startId,int fgsType){state="límite Android · reactivar externo";shutdown();}
    @Override public void onDestroy(){stopped=true;running=false;activeActor="";token="";removeOverlay();if(instance==this)instance=null;if(executor!=null)executor.shutdownNow();client.dispatcher().cancelAll();super.onDestroy();}
}
