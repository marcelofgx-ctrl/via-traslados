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
    private TextView tabTitle;
    private final Map<String,JSONObject> pendingDetails=new LinkedHashMap<>();
    private boolean dismissed=false;
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
    static void setForeground(boolean on){foreground=on;RequestMonitorService service=instance;if(on&&service!=null)service.ui.post(()->{service.removeOverlay();clearAlerts(service);});}
    static boolean runningFor(String id){return running&&!id.isEmpty()&&id.equals(activeActor);}
    static android.content.SharedPreferences prefs(Context c){return c.getSharedPreferences(PREF,MODE_PRIVATE);}
    static boolean desired(Context c,String id){return id!=null&&!id.isEmpty()&&prefs(c).getBoolean("available_"+id,false);}
    static boolean autoOpen(Context c,String id){return id!=null&&!id.isEmpty()&&prefs(c).getBoolean("auto_open_"+id,false);}
    static void setAutoOpen(Context c,String id,boolean on){if(id!=null&&!id.isEmpty())prefs(c).edit().putBoolean("auto_open_"+id,on).apply();}
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
            if(batch.pending==0){nm.cancel(batchTag(a),ALERT_ID);ui.post(()->{if(valid(a)){latestPending=0;pendingDetails.clear();dismissed=false;removeOverlay();}});return;}
            boolean alreadyActive=false;
            for(android.service.notification.StatusBarNotification n:nm.getActiveNotifications())
                if(n.getId()==ALERT_ID&&batchTag(a).equals(n.getTag()))alreadyActive=true;
            NotificationChannel channel=nm.getNotificationChannel(ALERTS);
            if(channel==null||channel.getImportance()==NotificationManager.IMPORTANCE_NONE)return;
            boolean audible=false;
            for(String id:batch.unannounced)if(!AlertSignal.wasSounded(this,RequestAlertQueue.key(a,id)))audible=true;
            final boolean directSignal=audible&&canPresent(a);
            if(directSignal)ui.post(()->{if(valid(a)&&!foreground)AlertSignal.playExternal(this);});
            String heading=batch.pending==1?"Nueva solicitud de traslado":batch.pending+" solicitudes pendientes";
            // A new batch replaces the previous summary, allowing one sound per batch.
            // Ordinary refreshes preserve the active notification and do not sound again.
            if(!batch.unannounced.isEmpty()||alreadyActive){
                if(audible)nm.cancel(batchTag(a),ALERT_ID);
                String notificationChannel=audible&&!directSignal?ALERTS:"via_requests_quiet_v2";
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
            final Map<String,JSONObject> details=new LinkedHashMap<>();
            for(int i=0;i<rows.length();i++){JSONObject x=rows.optJSONObject(i);if(x!=null&&"requested".equals(x.optString("status"))&&x.optBoolean("canQuote",false)){String id=x.optString("id","");if(id.matches("[A-Za-z0-9_-]{12,100}")&&!seen.getBoolean(RequestAlertQueue.key(a,id),false))details.put(id,x);}}
            ui.post(()->{if(valid(a)&&!foreground){pendingDetails.clear();for(Map.Entry<String,JSONObject> e:details.entrySet())if(!seen.getBoolean(RequestAlertQueue.key(a,e.getKey()),false))pendingDetails.put(e.getKey(),e.getValue());latestPending=pendingDetails.size();if(!canPresent(a)||latestPending==0){removeOverlay();return;}if(!batch.unannounced.isEmpty()){dismissed=false;presentBatch(a,latestPending);}else if(!dismissed)updateOverlay(latestPending);}});
        }catch(Exception ignored){/* reconnect on next bounded poll; no secrets or request data in logs */}
    }
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private GradientDrawable shape(int color,int corner){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(corner));return d;}
    private TextView label(String value,int size,int color,boolean bold){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);if(bold)t.setTypeface(null,android.graphics.Typeface.BOLD);return t;}
    private void updateOverlay(int count){
        if(overlay==null)return;
        if(count<=0){removeOverlay();return;}
        tabTitle.setText(count==1?"Nuevo traslado  "+(collapsed?"⌃":"⌄"):count+" traslados nuevos  "+(collapsed?"⌃":"⌄"));
        if(!collapsed)renderDetails();
    }
    private boolean canPresent(String a){
        if(!valid(a)||foreground||!Settings.canDrawOverlays(this))return false;
        KeyguardManager kg=getSystemService(KeyguardManager.class);PowerManager pm=getSystemService(PowerManager.class);
        NotificationManager nm=getSystemService(NotificationManager.class);
        return kg!=null&&!kg.isKeyguardLocked()&&pm!=null&&pm.isInteractive()&&nm!=null&&nm.getCurrentInterruptionFilter()==NotificationManager.INTERRUPTION_FILTER_ALL;
    }
    private void presentBatch(String a,int count){
        if(!canPresent(a)||count<=0||dismissed)return;
        if(!autoOpen(this,a)){showOverlay(a,count);return;}
        try{startActivity(new Intent(this,MainActivity.class).setAction(REVIEW).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP));}
        catch(RuntimeException e){showOverlay(a,count);return;}
        // Android can silently deny a background start. Keep the approved sheet as fallback.
        ui.postDelayed(()->{if(valid(a)&&!foreground&&!dismissed&&latestPending>0)showOverlay(a,latestPending);},900);
    }
    private void setCollapsed(boolean value){
        if(overlay==null||overlayBody==null||overlayParams==null)return;
        if(!value&&!canPresent(actor)){removeOverlay();return;}
        collapsed=value;overlayBody.setVisibility(value?View.GONE:View.VISIBLE);
        updateOverlay(latestPending);
        // Resize the actual window, not a translated child. No transparent touch-blocking area.
        overlayParams.height=WindowManager.LayoutParams.WRAP_CONTENT;
        try{WindowManager wm=getSystemService(WindowManager.class);if(wm!=null)wm.updateViewLayout(overlay,overlayParams);}
        catch(RuntimeException e){removeOverlay();}
    }
    private void attachTabGesture(View handle){
        handle.setOnClickListener(v->setCollapsed(!collapsed));
        handle.setOnTouchListener(new View.OnTouchListener(){
            float down;
            @Override public boolean onTouch(View v,android.view.MotionEvent e){
                switch(e.getActionMasked()){
                    case android.view.MotionEvent.ACTION_DOWN:down=e.getRawY();return true;
                    case android.view.MotionEvent.ACTION_UP:
                        float delta=e.getRawY()-down;
                        if(delta>dp(22))setCollapsed(true);
                        else if(delta<-dp(22))setCollapsed(false);
                        else v.performClick();return true;
                    case android.view.MotionEvent.ACTION_CANCEL:return true;
                    default:return true;
                }
            }
        });
    }
    private static final int INK=0xff183934, TEAL=0xff08655d, MUTED=0xff627b72, PAPER=0xfffaf8f2;
    private LinearLayout column(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);return l;}
    private GradientDrawable satin(int top,int bottom,int radius){GradientDrawable d=new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{top,bottom});d.setCornerRadius(dp(radius));d.setStroke(dp(1),0xffd3e0d8);return d;}
    private void space(LinearLayout l,int height){l.addView(new View(this),new LinearLayout.LayoutParams(1,dp(height)));}
    private void closeOverlay(){dismissed=true;AlertSignal.stop(this);removeOverlay();}
    private JSONObject nextDetails(){List<RequestAlertQueue.Entry> es=new ArrayList<>();for(JSONObject x:pendingDetails.values())es.add(new RequestAlertQueue.Entry(x.optString("id"),x.optString("created_at")));RequestAlertQueue.Selection sel=RequestAlertQueue.next(es,id->false);return sel==null?null:pendingDetails.get(sel.id);}
    private void line(LinearLayout parent,String value,int size,int color,boolean bold){TextView t=label(value,size,color,bold);t.setMaxLines(2);t.setEllipsize(android.text.TextUtils.TruncateAt.END);parent.addView(t);}
    private void point(LinearLayout parent,String key,String address,boolean first){
        LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);TextView dot=label(first?"●":"◆",19,TEAL,true);dot.setGravity(Gravity.CENTER);row.addView(dot,new LinearLayout.LayoutParams(dp(28),dp(38)));
        LinearLayout info=column();line(info,key,10,MUTED,true);line(info,address.isEmpty()?"Sin dirección":address,14,INK,true);row.addView(info,new LinearLayout.LayoutParams(0,-2,1));parent.addView(row);}
    private android.graphics.Bitmap portrait(JSONObject x){String v=x.optString("passengerPhotoJpegBase64","");if(!x.optBoolean("passengerPhotoAuthorized",false)||v.isEmpty()||v.length()>350000)return null;try{byte[] b=Base64.decode(v,Base64.DEFAULT);if(b.length<4||b.length>260000||(b[0]&255)!=255||(b[1]&255)!=216)return null;android.graphics.BitmapFactory.Options o=new android.graphics.BitmapFactory.Options();o.inJustDecodeBounds=true;android.graphics.BitmapFactory.decodeByteArray(b,0,b.length,o);if(o.outWidth<1||o.outHeight<1||o.outWidth>4096||o.outHeight>4096)return null;o.inSampleSize=1;while(Math.max(o.outWidth,o.outHeight)/o.inSampleSize>256)o.inSampleSize*=2;o.inJustDecodeBounds=false;return android.graphics.BitmapFactory.decodeByteArray(b,0,b.length,o);}catch(Exception e){return null;}}
    private void renderDetails(){
        if(overlayBody==null)return;overlayBody.removeAllViews();JSONObject x=nextDetails();if(x==null)return;
        String id=x.optString("id"),name=x.isNull("name")?"":x.optString("name","").trim();if(name.isEmpty())name="Pasajero";
        LinearLayout details=column();details.setPadding(0,dp(5),0,dp(4));
        LinearLayout person=new LinearLayout(this);person.setGravity(Gravity.CENTER_VERTICAL);
        FrameLayout avatar=new FrameLayout(this);avatar.setBackground(shape(0xffdcebe2,25));avatar.setClipToOutline(true);TextView initials=label(name.substring(0,1).toUpperCase(java.util.Locale.ROOT),20,TEAL,true);initials.setGravity(Gravity.CENTER);avatar.addView(initials,new FrameLayout.LayoutParams(-1,-1));android.graphics.Bitmap photo=portrait(x);if(photo!=null){ImageView image=new ImageView(this);image.setScaleType(ImageView.ScaleType.CENTER_CROP);image.setImageBitmap(photo);avatar.addView(image,new FrameLayout.LayoutParams(-1,-1));}person.addView(avatar,new LinearLayout.LayoutParams(dp(47),dp(47)));
        LinearLayout who=column();who.setPadding(dp(11),0,0,0);line(who,name,18,INK,true);line(who,"Pasajero · solicitud de traslado",12,MUTED,false);person.addView(who,new LinearLayout.LayoutParams(0,-2,1));details.addView(person);space(details,10);
        LinearLayout trip=column();trip.setPadding(dp(9),dp(9),dp(9),dp(9));trip.setBackground(satin(0xfff9fcf8,0xffeaf3ed,16));point(trip,"ORIGEN",x.optString("origin"),true);space(trip,5);point(trip,"DESTINO",x.optString("destination"),false);details.addView(trip);space(details,10);
        JSONObject route=x.optJSONObject("route");double km=route==null?Double.NaN:route.optDouble("distanceKm",Double.NaN);int min=route==null?-1:route.optInt("durationMinutes",-1);
        String dist=Double.isFinite(km)&&km>0?String.format(new java.util.Locale("es","UY"),"%.1f km",km):"—";String time=min>0?min+" min":"—";
        line(details,dist+"  ·  "+time,17,TEAL,true);String date=x.optString("date"),hour=x.optString("time");line(details,date+"  ·  "+hour+"     |     "+x.optInt("passengers",1)+" pax · "+x.optInt("bags",0)+" val.",13,MUTED,false);
        ScrollView scroll=new ScrollView(this);scroll.setVerticalScrollBarEnabled(false);scroll.addView(details,new ScrollView.LayoutParams(-1,-2));int max=Math.max(dp(110),getResources().getDisplayMetrics().heightPixels/2-dp(110));int width=Math.max(dp(100),getResources().getDisplayMetrics().widthPixels-dp(60));scroll.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(max,View.MeasureSpec.AT_MOST));overlayBody.addView(scroll,new LinearLayout.LayoutParams(-1,Math.min(max,scroll.getMeasuredHeight())));
        LinearLayout actions=new LinearLayout(this);actions.setPadding(0,dp(10),0,0);
        TextView seen=label("Visto",14,TEAL,true);seen.setGravity(Gravity.CENTER);seen.setBackground(satin(PAPER,0xffedf4ee,14));actions.addView(seen,new LinearLayout.LayoutParams(0,dp(48),1));seen.setOnClickListener(v->{if(!valid(actor))return;getSharedPreferences(SEEN,MODE_PRIVATE).edit().putBoolean(RequestAlertQueue.key(actor,id),true).apply();AlertSignal.stop(this);pendingDetails.remove(id);latestPending=pendingDetails.size();if(latestPending==0){NotificationManager nm=getSystemService(NotificationManager.class);if(nm!=null)nm.cancel(batchTag(actor),ALERT_ID);removeOverlay();}else updateOverlay(latestPending);});
        TextView open=label("Ver solicitud  ›",14,Color.WHITE,true);open.setGravity(Gravity.CENTER);open.setBackground(satin(0xff0b766b,0xff07564e,14));LinearLayout.LayoutParams op=new LinearLayout.LayoutParams(0,dp(48),2);op.leftMargin=dp(8);actions.addView(open,op);open.setOnClickListener(v->{AlertSignal.stop(this);closeOverlay();try{startActivity(new Intent(this,MainActivity.class).setAction(REVIEW).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP));}catch(RuntimeException e){try{open().send();}catch(PendingIntent.CanceledException ignored){}}});overlayBody.addView(actions);
    }
    private void showOverlay(String a,int count){
        if(!canPresent(a)||count<=0||dismissed)return;latestPending=count;
        if(overlay!=null){updateOverlay(count);return;}collapsed=true;
        LinearLayout box=column();box.setPadding(dp(12),dp(5),dp(12),dp(9));box.setBackground(satin(0xfffffdf7,0xffedf5ee,23));box.setElevation(dp(9));
        LinearLayout handle=column();handle.setGravity(Gravity.CENTER_HORIZONTAL);View grip=new View(this);grip.setBackground(shape(0xffa1b8ad,4));LinearLayout.LayoutParams gp=new LinearLayout.LayoutParams(dp(34),dp(4));gp.gravity=Gravity.CENTER_HORIZONTAL;handle.addView(grip,gp);
        LinearLayout head=new LinearLayout(this);head.setGravity(Gravity.CENTER_VERTICAL);
        TextView logo=label("V",19,Color.WHITE,true);logo.setGravity(Gravity.CENTER);logo.setBackground(satin(0xff137c70,0xff064c44,11));head.addView(logo,new LinearLayout.LayoutParams(dp(35),dp(35)));
        LinearLayout titles=column();titles.setPadding(dp(10),0,0,0);line(titles,"VÍA TRASLADOS",10,MUTED,true);tabTitle=label("",15,INK,true);titles.addView(tabTitle);head.addView(titles,new LinearLayout.LayoutParams(0,-2,1));
        TextView close=label("×",24,MUTED,false);close.setGravity(Gravity.CENTER);close.setContentDescription("Cerrar pestaña sin marcar solicitudes vistas");close.setOnClickListener(v->closeOverlay());head.addView(close,new LinearLayout.LayoutParams(dp(44),dp(44)));handle.addView(head,new LinearLayout.LayoutParams(-1,dp(47)));box.addView(handle);attachTabGesture(handle);attachTabGesture(titles);attachTabGesture(logo);
        overlayBody=column();overlayBody.setVisibility(View.GONE);box.addView(overlayBody,new LinearLayout.LayoutParams(-1,-2));
        WindowManager wm=getSystemService(WindowManager.class);if(wm==null)return;int width=Math.min(dp(440),getResources().getDisplayMetrics().widthPixels-dp(16));
        WindowManager.LayoutParams lp=new WindowManager.LayoutParams(width,WindowManager.LayoutParams.WRAP_CONTENT,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,PixelFormat.TRANSLUCENT);
        lp.gravity=Gravity.BOTTOM|Gravity.CENTER_HORIZONTAL;lp.y=dp(6);if(Build.VERSION.SDK_INT>=30){lp.setFitInsetsTypes(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());lp.setFitInsetsSides(WindowInsets.Side.all());lp.setFitInsetsIgnoringVisibility(true);}
        overlay=box;overlayParams=lp;updateOverlay(count);try{wm.addView(box,lp);}catch(RuntimeException e){removeOverlay();}
    }
    private void removeOverlay(){View old=overlay;overlay=null;tabTitle=null;overlayBody=null;overlayParams=null;collapsed=false;if(old!=null){try{WindowManager wm=getSystemService(WindowManager.class);if(wm!=null)wm.removeViewImmediate(old);}catch(RuntimeException ignored){}}}
    @Override public void onTaskRemoved(Intent rootIntent){closeOverlay();super.onTaskRemoved(rootIntent);}
    private void shutdown(){AlertSignal.stop(this);pendingDetails.clear();stopped=true;running=false;activeActor="";token="";nextToken="";nextActor="";removeOverlay();if(executor!=null)executor.shutdownNow();client.dispatcher().cancelAll();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    @Override public void onTimeout(int startId,int fgsType){state="límite Android · reactivar externo";shutdown();}
    @Override public void onDestroy(){AlertSignal.stop(this);pendingDetails.clear();stopped=true;running=false;activeActor="";token="";removeOverlay();if(instance==this)instance=null;if(executor!=null)executor.shutdownNow();client.dispatcher().cancelAll();super.onDestroy();}
}
