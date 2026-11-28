package uy.viatraslados.conductor;
import android.app.*;
import android.content.*;
import android.graphics.*;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import android.view.*;
import android.widget.*;
import android.util.Base64;
import androidx.core.content.FileProvider;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
/** Account-scoped onboarding, no photo storage outside the private temporary camera file. */
final class DriverProfileFlow {
    interface Done{void call(int status,String body,String error);}
    interface Api{void call(String method,String path,JSONObject data,Done done);}
    private final Activity a;private final Api api;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Handler ui=new Handler(Looper.getMainLooper());
    private static final String PATH="/api/staff/driver-profile",ADMIN="/api/admin/driver-profiles";
    private static final long REMIND=30*60*1000L;
    private static final int CAMERA=3611,GALLERY=3612;
    private static final int TEAL=0xff006b63,INK=0xff193334,MUTED=0xff647773,SOFT=0xffedf6f1;
    private String account="";private JSONObject meta=new JSONObject();
    private Dialog panel,reminder,review;
    private boolean checking=false,busy=false,destroyed=false;
    private long nextReminder=0;private int epoch=0,slot=-1;
    private File capture;private Uri captureUri;
    private EditText plate,year;private TextView make,model,color;
    private TextView plateStatus,stepIndicator;private LinearLayout[] steps;private Button nextAction;private int currentStep;private CheckBox consentBox;
    private final String[] jpeg={"","",""},signal={"review","review","review"},plates={"",""};
    private final ImageView[] previews=new ImageView[3];private final TextView[] feedback=new TextView[3];
    DriverProfileFlow(Activity a,Api api){this.a=a;this.api=api;File dir=new File(a.getCacheDir(),"profile_capture");File[] stale=dir.listFiles();if(stale!=null)for(File x:stale)x.delete();}
    void setAccount(String id){if(!id.equals(account)){clearAccount();account=id;nextReminder=0;}}
    void onResume(){if(panel==null&&review==null&&reminder==null)nextReminder=0;}
    void clearAccount(){
        epoch++;account="";checking=false;nextReminder=0;busy=false;clearCapture();
        if(panel!=null)panel.dismiss();if(reminder!=null)reminder.dismiss();if(review!=null)review.dismiss();
        panel=null;reminder=null;review=null;Arrays.fill(jpeg,"");Arrays.fill(plates,"");Arrays.fill(signal,"review");meta=new JSONObject();
    }
    void destroy(){destroyed=true;clearAccount();worker.shutdownNow();}
    private boolean alive(int e){return !destroyed&&!a.isFinishing()&&!a.isDestroyed()&&epoch==e&&!account.isEmpty();}
    private int dp(int n){return Math.round(n*a.getResources().getDisplayMetrics().density);}
    private void msg(String s){Toast.makeText(a,s,Toast.LENGTH_LONG).show();}
    private boolean incomplete(){String s=meta.optString("state");return s.equals("missing")||s.equals("rejected")||s.equals("revoked")||s.equals("vehicle_changed");}
    void checkReminder(){
        if(account.isEmpty()||checking||panel!=null||reminder!=null||review!=null||SystemClock.elapsedRealtime()<nextReminder)return;
        checking=true;int e=epoch;
        api.call("GET",PATH,null,(code,body,error)->{
            if(!alive(e))return;checking=false;nextReminder=SystemClock.elapsedRealtime()+REMIND;
            if(code!=200)return;
            try{meta=new JSONObject(body);}catch(Exception ex){return;}
            if(!incomplete()||!a.hasWindowFocus()||panel!=null||review!=null)return;
            AlertDialog d=new AlertDialog.Builder(a).setTitle("Completá tu perfil")
              .setMessage(meta.optString("state").equals("rejected")?"Tu ficha necesita correcciones. "+meta.optString("reviewNote"):"Agregá tu foto, dos fotos del automóvil y confirmá la matrícula para que el pasajero pueda reconocerte.")
              .setPositiveButton("Completar ahora",(x,w)->open()).setNegativeButton("Más tarde",null).create();
            reminder=d;d.setOnDismissListener(x->{if(reminder==d)reminder=null;});d.show();
        });
    }
    void open(){
        if(account.isEmpty()||panel!=null)return;int e=epoch;
        api.call("GET",PATH+"?include=photos",null,(status,body,error)->{
            if(!alive(e))return;if(status!=200){msg("Ficha no disponible. "+error);return;}
            try{meta=new JSONObject(body);}catch(Exception ex){msg("Respuesta de ficha inválida");return;}if(meta.optJSONObject("photos")==null)showForm();else showProfile();
        });
    }
    private LinearLayout column(){LinearLayout l=new LinearLayout(a);l.setOrientation(1);return l;}
    private TextView line(LinearLayout l,String s,int size,int color,boolean bold){
        TextView t=new TextView(a);t.setText(s);t.setTextSize(size);t.setTextColor(color);if(bold)t.setTypeface(null,Typeface.BOLD);t.setPadding(0,dp(4),0,dp(4));l.addView(t);return t;
    }
    private Button button(LinearLayout l,String label,Runnable run){Button b=new Button(a);b.setText(label);b.setAllCaps(false);b.setTextColor(TEAL);l.addView(b,new LinearLayout.LayoutParams(-1,dp(48)));b.setOnClickListener(v->run.run());return b;}
    private EditText field(LinearLayout l,String title,String initial){line(l,title,12,MUTED,true);EditText f=new EditText(a);f.setSingleLine(true);f.setText(initial);f.setTextSize(16);l.addView(f);return f;}
    private Dialog page(String title,LinearLayout content){
        Dialog d=new Dialog(a,android.R.style.Theme_Material_Light_NoActionBar);
        LinearLayout outer=column();outer.setBackgroundColor(0xfff8fbf9);outer.setPadding(dp(16),dp(12),dp(16),dp(8));
        LinearLayout head=new LinearLayout(a);head.setGravity(Gravity.CENTER_VERTICAL);TextView back=new TextView(a);back.setText("‹");back.setTextSize(32);back.setGravity(Gravity.CENTER);back.setTextColor(TEAL);head.addView(back,new LinearLayout.LayoutParams(dp(48),dp(48)));back.setOnClickListener(v->d.dismiss());TextView heading=new TextView(a);heading.setText(title);heading.setTextSize(20);heading.setTextColor(INK);heading.setTypeface(null,Typeface.BOLD);head.addView(heading,new LinearLayout.LayoutParams(0,-2,1));outer.addView(head);
        ScrollView scroll=new ScrollView(a);scroll.setFillViewport(false);scroll.addView(content);outer.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        d.setContentView(outer);d.show();if(d.getWindow()!=null)d.getWindow().setLayout(-1,-1);return d;
    }
    private android.graphics.drawable.GradientDrawable rounded(int fill,int stroke,int radius){
        android.graphics.drawable.GradientDrawable d=new android.graphics.drawable.GradientDrawable();d.setColor(fill);d.setCornerRadius(dp(radius));if(stroke!=0)d.setStroke(dp(1),stroke);return d;
    }
    private LinearLayout section(LinearLayout parent){
        LinearLayout card=column();card.setPadding(dp(14),dp(12),dp(14),dp(12));card.setBackground(rounded(0xffffffff,0xffdce9e4,16));
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.bottomMargin=dp(10);parent.addView(card,p);return card;
    }
    private Button action(LinearLayout parent,String label,boolean primary,Runnable click){
        Button b=new Button(a);b.setText(label);b.setAllCaps(false);b.setTextSize(14);b.setTypeface(null,Typeface.BOLD);b.setTextColor(primary?0xffffffff:TEAL);b.setBackground(rounded(primary?TEAL:0xfff0f7f4,primary?0:0xffd7e7df,12));b.setPadding(dp(8),0,dp(8),0);
        parent.addView(b,new LinearLayout.LayoutParams(-1,dp(50)));b.setOnClickListener(v->click.run());return b;
    }
    private EditText neatField(LinearLayout parent,String title,String initial,String hint){
        line(parent,title,11,MUTED,true);EditText e=new EditText(a);e.setSingleLine(true);e.setTextSize(16);e.setTextColor(INK);e.setHintTextColor(0xff8a9995);e.setHint(hint);e.setText(initial);e.setPadding(dp(12),0,dp(12),0);e.setBackground(rounded(0xfff8fbf9,0xffdce9e4,11));
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(49));p.bottomMargin=dp(5);parent.addView(e,p);return e;
    }
    private String value(JSONObject j,String key){String v=j.optString(key,"").trim();return v.equals("null")?"":v;}
    private String first(String... values){for(String v:values)if(v!=null&&!v.isEmpty())return v;return "";}
    private TextView selector(LinearLayout parent,String title,String initial,String hint){
        line(parent,title,11,MUTED,true);
        LinearLayout box=new LinearLayout(a);box.setGravity(Gravity.CENTER_VERTICAL);box.setPadding(dp(12),0,dp(12),0);box.setBackground(rounded(0xfff8fbf9,0xffdce9e4,11));box.setFocusable(true);
        TextView text=new TextView(a);text.setTextSize(16);text.setTextColor(INK);text.setSingleLine();text.setEllipsize(android.text.TextUtils.TruncateAt.END);text.setHint(hint);text.setHintTextColor(0xff8a9995);text.setText(initial);box.addView(text,new LinearLayout.LayoutParams(0,-2,1));
        TextView arrow=new TextView(a);arrow.setText("⌄");arrow.setTextSize(23);arrow.setTextColor(TEAL);box.addView(arrow);
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(50));p.bottomMargin=dp(6);parent.addView(box,p);box.setContentDescription(title+", selector");return text;
    }
    private interface Pick {void selected(String value);}
    private void chooseOption(String title,String[] choices,String current,Pick pick){
        if(busy)return;
        java.util.ArrayList<String> all=new java.util.ArrayList<>(Arrays.asList(choices));
        if(!current.isEmpty()&&!all.contains(current))all.add(0,current);
        LinearLayout content=column();content.setPadding(dp(16),dp(8),dp(16),0);
        EditText search=new EditText(a);search.setSingleLine(true);search.setHint("Buscar "+title.toLowerCase(Locale.ROOT));search.setTextSize(16);search.setPadding(dp(12),0,dp(12),0);search.setBackground(rounded(0xfff5f9f7,0xffdce9e4,10));content.addView(search,new LinearLayout.LayoutParams(-1,dp(48)));
        ListView list=new ListView(a);content.addView(list,new LinearLayout.LayoutParams(-1,dp(310)));
        ArrayAdapter<String> adapter=new ArrayAdapter<>(a,android.R.layout.simple_list_item_1,new java.util.ArrayList<>());list.setAdapter(adapter);
        Runnable filter=()->{String needle=fold(search.getText().toString());adapter.clear();for(String value:all)if(value.equals(ViaVehicleCatalog.OTHER)||fold(value).contains(needle))adapter.add(value);adapter.notifyDataSetChanged();};
        search.addTextChangedListener(new android.text.TextWatcher(){public void beforeTextChanged(CharSequence s,int st,int c,int a){}public void onTextChanged(CharSequence s,int st,int b,int c){filter.run();}public void afterTextChanged(android.text.Editable e){}});
        AlertDialog dialog=new AlertDialog.Builder(a).setTitle("Elegí "+title.toLowerCase(Locale.ROOT)).setView(content).setNegativeButton("Cancelar",null).create();
        list.setOnItemClickListener((parent,view,position,id)->{String selected=adapter.getItem(position);dialog.dismiss();if(ViaVehicleCatalog.OTHER.equals(selected)){
            EditText custom=new EditText(a);custom.setSingleLine();custom.setHint(title);custom.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(title.equals("Color")?35:45)});
            AlertDialog edit=new AlertDialog.Builder(a).setTitle("Ingresá "+title.toLowerCase(Locale.ROOT)).setView(custom).setNegativeButton("Cancelar",null).setPositiveButton("Guardar",null).create();edit.show();
            edit.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{String value=custom.getText().toString().trim();if(value.isEmpty()){custom.setError("Completá este dato");return;}pick.selected(value);edit.dismiss();});
        }else if(selected!=null)pick.selected(selected);});
        filter.run();dialog.show();if(dialog.getWindow()!=null)dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN|WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    }
    private String fold(String text){return java.text.Normalizer.normalize(text,java.text.Normalizer.Form.NFD).replaceAll("\\p{M}+","").toLowerCase(Locale.ROOT);}
    private void photoTile(LinearLayout parent,int k,String title,String hint,boolean wide){
        LinearLayout card=column();card.setPadding(dp(10),dp(8),dp(10),dp(10));card.setBackground(rounded(0xfff7faf8,0xffdce9e4,13));
        LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(wide?-1:0,-2,wide?0:1);if(k==2)cp.leftMargin=dp(8);parent.addView(card,cp);
        line(card,title,14,INK,true);line(card,hint,12,MUTED,false);
        FrameLayout frame=new FrameLayout(a);
        if(k==0){
            android.graphics.drawable.GradientDrawable circle=new android.graphics.drawable.GradientDrawable();circle.setShape(android.graphics.drawable.GradientDrawable.OVAL);circle.setColor(SOFT);circle.setStroke(dp(2),0xffa5c8bc);frame.setBackground(circle);
            LinearLayout.LayoutParams fp=new LinearLayout.LayoutParams(dp(144),dp(144));fp.gravity=Gravity.CENTER_HORIZONTAL;fp.topMargin=dp(8);fp.bottomMargin=dp(6);card.addView(frame,fp);
        }else{frame.setBackground(rounded(SOFT,0,10));card.addView(frame,new LinearLayout.LayoutParams(-1,dp(98)));}
        frame.setClipToOutline(true);
        TextView placeholder=new TextView(a);placeholder.setText(k==0?"＋\nRetrato":"＋\nFoto");placeholder.setTextSize(14);placeholder.setGravity(Gravity.CENTER);placeholder.setTextColor(TEAL);frame.addView(placeholder,new FrameLayout.LayoutParams(-1,-1));
        ImageView img=new ImageView(a);img.setScaleType(k==0?ImageView.ScaleType.CENTER_CROP:ImageView.ScaleType.CENTER_INSIDE);frame.addView(img,new FrameLayout.LayoutParams(-1,-1));previews[k]=img;
        feedback[k]=line(card,"Pendiente",12,MUTED,true);feedback[k].setMinLines(2);
        action(card,"Agregar foto",false,()->choose(k));frame.setOnClickListener(v->choose(k));
    }
    private void refreshPlate(){
        if(plate==null||plateStatus==null)return;
        String displayed=plate.getText().toString(),p=UruguayPlate.compact(displayed);
        boolean valid=!p.isEmpty(),mismatch=valid&&((!plates[0].isEmpty()&&!plates[0].equals(p))||(!plates[1].isEmpty()&&!plates[1].equals(p)));
        boolean match=valid&&p.equals(plates[0])&&p.equals(plates[1]);
        plateStatus.setText(!valid?"Formato obligatorio · AAA-1234":mismatch?"La lectura de una foto no coincide · revisar":match?"Matrícula válida · coincide con ambas fotos":"Matrícula válida · confirmá que sea correcta");
        plateStatus.setTextColor(mismatch?0xffa45e21:valid?TEAL:MUTED);
        plate.setBackground(rounded(0xffffffff,mismatch?0xffd9a475:valid?0xff7eb9a5:0xffdce9e4,11));
    }
    private void switchStep(int index,ScrollView scroll){
        if(busy)return;currentStep=index;steps[0].setVisibility(index==0?View.VISIBLE:View.GONE);steps[1].setVisibility(index==1?View.VISIBLE:View.GONE);
        stepIndicator.setText(index==0?"1 DE 2  ·  CONDUCTOR     ━━━  ───":"2 DE 2  ·  VEHÍCULO     ━━━  ━━━");
        nextAction.setText(index==0?"Continuar  →":"Enviar ficha para revisión");
        if(index==1)plate.clearFocus();scroll.post(()->scroll.scrollTo(0,0));
    }
    private String statusLabel(String state){switch(state){case "approved":return "Perfil aprobado";case "pending":return "Pendiente de revisión";case "rejected":return "Rectificación solicitada";case "revoked":return "Aprobación revocada";case "vehicle_changed":return "Vehículo actualizado";default:return "Perfil incompleto";}}
    private Bitmap decode(String image){try{byte[] data=Base64.decode(image,Base64.DEFAULT);return BitmapFactory.decodeByteArray(data,0,data.length);}catch(Exception e){return null;}}
    private void photoView(LinearLayout parent,String title,String encoded,boolean face){
        LinearLayout card=column();parent.addView(card,new LinearLayout.LayoutParams(face?-1:0,-2,face?0:1));card.setPadding(dp(4),dp(4),dp(4),dp(4));
        ImageView img=new ImageView(a);img.setImageBitmap(decode(encoded));img.setScaleType(face?ImageView.ScaleType.CENTER_CROP:ImageView.ScaleType.FIT_CENTER);
        android.graphics.drawable.GradientDrawable bg=rounded(SOFT,0xffdce9e4,12);if(face)bg.setShape(android.graphics.drawable.GradientDrawable.OVAL);img.setBackground(bg);img.setClipToOutline(true);
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(face?dp(108):-1,dp(face?108:112));p.gravity=Gravity.CENTER_HORIZONTAL;card.addView(img,p);TextView label=line(card,title,12,MUTED,true);label.setGravity(Gravity.CENTER);
        img.setOnClickListener(v->{ImageView full=new ImageView(a);full.setImageBitmap(decode(encoded));full.setAdjustViewBounds(true);full.setScaleType(ImageView.ScaleType.FIT_CENTER);new AlertDialog.Builder(a).setTitle(title).setView(full).setPositiveButton("Cerrar",null).show();});
    }
    private void summary(LinearLayout l,JSONObject p){
        JSONObject photos=p.optJSONObject("photos");if(photos==null)photos=new JSONObject();
        LinearLayout person=section(l);photoView(person,"Conductor",photos.optString("driver"),true);
        TextView name=line(person,p.optString("name","Mi perfil"),20,INK,true);name.setGravity(Gravity.CENTER);
        TextView state=line(person,statusLabel(p.optString("state")),14,p.optString("state").equals("approved")?TEAL:0xffa45e21,true);state.setGravity(Gravity.CENTER);
        if(!p.optString("reviewNote").isEmpty())line(person,p.optString("reviewNote"),14,INK,false);
        LinearLayout vehicle=section(l);line(vehicle,"MI VEHÍCULO",11,MUTED,true);line(vehicle,p.optString("make")+" "+p.optString("model"),21,INK,true);
        line(vehicle,p.optString("color")+(p.isNull("year")?"":" · "+p.optString("year")),14,MUTED,false);
        TextView plateView=line(vehicle,UruguayPlate.format(p.optString("plate")),24,INK,true);plateView.setGravity(Gravity.CENTER);plateView.setBackground(rounded(0xfff5f8fa,0xffb2c4cc,10));plateView.setPadding(0,dp(10),0,dp(10));
        LinearLayout pair=new LinearLayout(a);vehicle.addView(pair);photoView(pair,"Frente",photos.optString("front"),false);photoView(pair,"Trasera",photos.optString("rear"),false);
        JSONObject r=p.optJSONObject("recognition");if(r!=null){line(vehicle,"Verificación automática",13,INK,true);line(vehicle,("pass".equals(r.optString("face"))?"Rostro detectado":"Retrato requiere revisión")+" · "+("pass".equals(r.optString("front"))&&"pass".equals(r.optString("rear"))?"Vehículo detectado":"Fotos del vehículo requieren revisión"),12,MUTED,false);line(vehicle,r.optBoolean("plateMatch")?"Matrícula coincide con ambas fotos":"Matrícula requiere comprobación",12,MUTED,false);}
    }
    private void history(LinearLayout l,JSONObject p){
        JSONArray h=p.optJSONArray("history");if(h==null||h.length()==0)return;LinearLayout card=section(l);line(card,"Historial de revisión",16,INK,true);
        for(int i=0;i<h.length();i++){JSONObject row=h.optJSONObject(i);if(row==null)continue;line(card,statusLabel(row.optString("state"))+" · "+row.optString("reviewer"),13,TEAL,true);line(card,new java.text.SimpleDateFormat("dd/MM/yyyy HH:mm",Locale.getDefault()).format(new java.util.Date(row.optLong("at")*1000))+"  "+row.optString("note"),12,MUTED,false);}
    }
    private void showProfile(){
        LinearLayout l=column();summary(l,meta);history(l,meta);
        action(l,"Editar mi ficha",true,()->{Dialog old=panel;if(old!=null)old.dismiss();panel=null;showForm();});
        Dialog d=page("Mi perfil",l);panel=d;d.setOnDismissListener(x->{if(panel==d)panel=null;});
    }
    private void showForm(){
        if(panel!=null||account.isEmpty())return;
        Dialog d=new Dialog(a,android.R.style.Theme_Material_Light_NoActionBar);
        LinearLayout outer=column();outer.setBackgroundColor(0xfff5f9f7);outer.setPadding(dp(16),dp(10),dp(16),dp(12));outer.setFocusableInTouchMode(true);
        LinearLayout header=new LinearLayout(a);header.setGravity(Gravity.CENTER_VERTICAL);
        TextView back=new TextView(a);back.setText("‹");back.setTextSize(32);back.setTextColor(TEAL);back.setGravity(Gravity.CENTER);header.addView(back,new LinearLayout.LayoutParams(dp(48),dp(48)));
        TextView title=new TextView(a);title.setText("Mi ficha de conductor");title.setTextColor(INK);title.setTextSize(20);title.setTypeface(null,Typeface.BOLD);header.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        TextView ver=new TextView(a);ver.setText("V"+BuildConfig.VERSION_NAME.replaceFirst("^0\\.","").replace("-profile-qa","")+" QA");ver.setTextColor(MUTED);ver.setTextSize(11);header.addView(ver);outer.addView(header);
        stepIndicator=line(outer,"",12,TEAL,true);line(outer,"Entorno de prueba · solo datos ficticios",11,MUTED,false);
        ScrollView scroll=new ScrollView(a);scroll.setFillViewport(false);scroll.setClipToPadding(false);scroll.setPadding(0,dp(5),0,dp(5));LinearLayout holder=column();scroll.addView(holder);outer.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        steps=new LinearLayout[]{column(),column()};holder.addView(steps[0]);holder.addView(steps[1]);
        String state=meta.optString("state","missing");
        LinearLayout firstCard=section(steps[0]);line(firstCard,"Tu presentación",21,INK,true);line(firstCard,"Una foto clara ayuda al pasajero a reconocerte.",13,MUTED,false);
        if(state.equals("approved")||state.equals("pending"))line(firstCard,state.equals("approved")?"Ficha aprobada · actualizar requiere nueva revisión":"Ficha enviada · pendiente de revisión",13,TEAL,true);
        if(state.equals("rejected")||state.equals("revoked"))line(firstCard,value(meta,"reviewNote"),13,0xffa45e21,true);
        photoTile(firstCard,0,"Foto del conductor","Una sola cara, bien iluminada.",true);
        JSONObject old=meta.optJSONObject("vehicle");if(old==null)old=new JSONObject();
        boolean changed=state.equals("vehicle_changed"),initial=state.equals("missing")||changed;
        String existingMake=initial?first(value(old,"make"),value(meta,"make")):first(value(meta,"make"),value(old,"make"));
        String existingModel=initial?first(value(old,"model"),value(meta,"model")):first(value(meta,"model"),value(old,"model"));
        String existingColor=initial?first(value(old,"color"),changed?"":value(meta,"color")):first(value(meta,"color"),value(old,"color"));
        LinearLayout data=section(steps[1]);line(data,"Tu vehículo",21,INK,true);
        boolean prefilled=!existingMake.isEmpty()&&!existingModel.isEmpty();
        line(data,prefilled?"Datos precargados de tu ficha. Revisalos si cambiaste de auto.":"Todavía no tenemos un vehículo registrado. Completá sus datos.",13,MUTED,false);
        make=selector(data,"MARCA",existingMake,"Seleccioná marca");
        model=selector(data,"MODELO",existingModel,"Seleccioná modelo");
        color=selector(data,"COLOR",existingColor,"Seleccioná color");
        String registeredYear=value(old,"year");
        String initialYear=initial?registeredYear:first(value(meta,"year"),registeredYear);
        year=neatField(data,"AÑO",initialYear,"Ej. 2024");year.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);year.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(4)});
        line(data,"Catálogo orientado a vehículos de los últimos 10 años.",11,MUTED,false);
        String type=value(old,"type"),pax=value(old,"passengerCapacity"),bags=value(old,"luggageCapacity");
        boolean same=existingMake.equals(value(old,"make"))&&existingModel.equals(value(old,"model"));
        TextView extra=line(data,same?(!type.isEmpty()?type+"  ·  ":"")+(!pax.isEmpty()?pax+" pasajeros  ":"")+(!bags.isEmpty()?bags+" valijas":""):"",12,TEAL,true);
        if(extra.getText().length()==0)extra.setVisibility(View.GONE);
        Runnable changedVehicle=()->{year.setText("");extra.setVisibility(View.GONE);for(int i=1;i<3;i++){jpeg[i]="";signal[i]="review";plates[i-1]="";if(previews[i]!=null){previews[i].setImageDrawable(null);feedback[i].setText("Agregá una foto del nuevo vehículo");}}refreshPlate();};
        ((View)make.getParent()).setOnClickListener(v->chooseOption("Marca",ViaVehicleCatalog.brands(),make.getText().toString(),picked->{
            if(!picked.equals(make.getText().toString())){make.setText(picked);model.setText("");changedVehicle.run();}
        }));
        ((View)model.getParent()).setOnClickListener(v->{if(make.getText().length()==0){msg("Elegí primero la marca.");return;}chooseOption("Modelo",ViaVehicleCatalog.modelsFor(make.getText().toString()),model.getText().toString(),picked->{if(!picked.equals(model.getText().toString())){model.setText(picked);changedVehicle.run();}});});
        ((View)color.getParent()).setOnClickListener(v->chooseOption("Color",ViaVehicleCatalog.colors(),color.getText().toString(),picked->color.setText(picked)));
        LinearLayout plateCard=section(steps[1]);line(plateCard,"Matrícula",18,INK,true);line(plateCard,"Ingresá las tres letras y los cuatro números.",13,MUTED,false);
        plate=neatField(plateCard,"MATRÍCULA URUGUAYA",initial?"":UruguayPlate.format(value(meta,"plate")),"AAA-1234");
        plate.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS|android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        plate.setTypeface(Typeface.MONOSPACE,Typeface.BOLD);plate.setTextSize(25);plate.setGravity(Gravity.CENTER);plate.setLetterSpacing(.12f);
        plateStatus=line(plateCard,"",12,MUTED,false);
        plate.addTextChangedListener(new android.text.TextWatcher(){boolean adjusting=false;public void beforeTextChanged(CharSequence s,int st,int c,int a){}public void onTextChanged(CharSequence s,int st,int b,int c){}public void afterTextChanged(android.text.Editable e){
            if(adjusting)return;String raw=e.toString(),formatted=UruguayPlate.format(raw);
            if(!raw.equals(formatted)){adjusting=true;int pos=Math.max(0,plate.getSelectionStart());String prefix=UruguayPlate.format(raw.substring(0,Math.min(pos,raw.length())));plate.setText(formatted);plate.setSelection(Math.min(prefix.length(),formatted.length()));adjusting=false;}refreshPlate();
        }});refreshPlate();
        LinearLayout photos=section(steps[1]);line(photos,"Fotos del automóvil",18,INK,true);line(photos,"Dos vistas del mismo auto, con las matrículas legibles.",13,MUTED,false);
        LinearLayout pair=new LinearLayout(a);photos.addView(pair,new LinearLayout.LayoutParams(-1,-2));
        photoTile(pair,1,"Frente","Matrícula visible",false);photoTile(pair,2,"Trasera","Matrícula visible",false);
        consentBox=new CheckBox(a);consentBox.setText("Autorizo mostrar las fotos y matrícula únicamente a pasajeros de mis reservas confirmadas activas.");consentBox.setTextColor(INK);consentBox.setTextSize(13);steps[1].addView(consentBox);
        nextAction=action(outer,"Continuar  →",true,()->{if(busy)return;if(currentStep==0){if(jpeg[0].isEmpty()){msg("Agregá primero la foto del conductor.");return;}switchStep(1,scroll);}else submit(consentBox.isChecked());});
        back.setOnClickListener(v->{if(busy)return;if(currentStep==1)switchStep(0,scroll);else d.dismiss();});
        d.setOnKeyListener((dialog,key,event)->{if(key==KeyEvent.KEYCODE_BACK&&event.getAction()==KeyEvent.ACTION_UP&&currentStep==1){switchStep(0,scroll);return true;}return false;});
        JSONObject saved=meta.optJSONObject("photos"),signals=meta.optJSONObject("recognition");
        if(saved!=null&&signals!=null){
            String[] keys={"driver","front","rear"},checks={"face","front","rear"};
            for(int i=0;i<3;i++){if(!"pass".equals(signals.optString(checks[i]))||(changed&&i>0))continue;String encoded=saved.optString(keys[i]);Bitmap img=decode(encoded);if(img==null)continue;jpeg[i]=encoded;signal[i]="pass";previews[i].setImageBitmap(img);feedback[i].setText("Foto guardada · podés reemplazarla");if(i>0)plates[i-1]=signals.optString(i==1?"frontPlate":"rearPlate");}
            refreshPlate();
        }
        panel=d;switchStep(0,scroll);
        d.setContentView(outer);d.show();if(d.getWindow()!=null){d.getWindow().setLayout(-1,-1);d.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE|WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);}outer.requestFocus();
        d.setOnDismissListener(x->{if(panel==d){panel=null;Arrays.fill(jpeg,"");Arrays.fill(signal,"review");Arrays.fill(plates,"");clearCapture();busy=false;slot=-1;}});
    }
    private void choose(int index){
        if(busy||panel==null)return;
        new AlertDialog.Builder(a).setTitle("Agregar fotografía").setItems(new String[]{"Tomar foto","Elegir imagen"},(d,w)->{
            slot=index;try{
                if(w==0){
                    clearCapture();File folder=new File(a.getCacheDir(),"profile_capture");folder.mkdirs();
                    capture=File.createTempFile("photo-",".jpg",folder);
                    captureUri=FileProvider.getUriForFile(a,a.getPackageName()+".profilephotos",capture);
                    Intent intent=new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT,captureUri);
                    intent.setClipData(ClipData.newRawUri("photo",captureUri));intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    a.startActivityForResult(intent,CAMERA);
                }else{
                    Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);a.startActivityForResult(intent,GALLERY);
                }
            }catch(Exception e){clearCapture();msg("No se pudo abrir la cámara o galería.");}
        }).setNegativeButton("Volver",null).show();
    }
    private void clearCapture(){if(captureUri!=null)try{a.revokeUriPermission(captureUri,Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);}catch(Exception ignored){}if(capture!=null)capture.delete();capture=null;captureUri=null;}
    boolean onResult(int request,int result,Intent data){
        if(request!=CAMERA&&request!=GALLERY)return false;
        final int k=slot,e=epoch;final Dialog owner=panel;
        Uri uri=request==CAMERA?captureUri:data==null?null:data.getData();
        if(result!=Activity.RESULT_OK||uri==null||k<0||owner==null){clearCapture();return true;}
        busy=true;jpeg[k]="";signal[k]="review";if(k>0)plates[k-1]="";feedback[k].setText("Analizando en el teléfono…");
        worker.execute(()->{
            try{
                Bitmap b;
                if(Build.VERSION.SDK_INT>=28){
                    b=ImageDecoder.decodeBitmap(ImageDecoder.createSource(a.getContentResolver(),uri),(decoder,info,source)->{
                        int w=info.getSize().getWidth(),h=info.getSize().getHeight();float ratio=Math.min(1f,1600f/Math.max(w,h));
                        decoder.setTargetSize(Math.max(1,Math.round(w*ratio)),Math.max(1,Math.round(h*ratio)));decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
                    });
                }else{
                    BitmapFactory.Options o=new BitmapFactory.Options();o.inJustDecodeBounds=true;
                    try(InputStream in=a.getContentResolver().openInputStream(uri)){BitmapFactory.decodeStream(in,null,o);}
                    o.inSampleSize=1;while(Math.max(o.outWidth,o.outHeight)/o.inSampleSize>1600)o.inSampleSize*=2;o.inJustDecodeBounds=false;
                    try(InputStream in=a.getContentResolver().openInputStream(uri)){b=BitmapFactory.decodeStream(in,null,o);}
                    if(b!=null)try(InputStream in=a.getContentResolver().openInputStream(uri)){android.media.ExifInterface ex=new android.media.ExifInterface(in);int orientation=ex.getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION,1);Matrix matrix=new Matrix();if(orientation==6)matrix.postRotate(90);else if(orientation==3)matrix.postRotate(180);else if(orientation==8)matrix.postRotate(270);if(!matrix.isIdentity())b=Bitmap.createBitmap(b,0,0,b.getWidth(),b.getHeight(),matrix,true);}catch(Exception ignored){}
                }
                if(b==null||b.getWidth()<480||b.getHeight()<360)throw new IOException("Foto demasiado pequeña");
                DriverPhotoRecognition.Result r=DriverPhotoRecognition.inspect(b,k);
                ByteArrayOutputStream out=new ByteArrayOutputStream();
                for(int q=82;q>=28;q-=9){out.reset();b.compress(Bitmap.CompressFormat.JPEG,q,out);if(out.size()<=180000)break;}
                if(out.size()>180000)throw new IOException("Foto demasiado grande");
                final Bitmap preview=b;final String encoded=Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP);
                ui.post(()->{if(!alive(e)||panel!=owner)return;busy=false;clearCapture();feedback[k].setText(r.message);
                    if(r.reject){previews[k].setImageDrawable(null);return;}
                    jpeg[k]=encoded;signal[k]=r.state;previews[k].setImageBitmap(preview);
                    if(k>0){plates[k-1]=r.plate;if(plate.getText().toString().trim().isEmpty()&&!r.plate.isEmpty())plate.setText(UruguayPlate.format(r.plate));refreshPlate();}
                });
            }catch(Exception ex){ui.post(()->{if(alive(e)&&panel==owner){busy=false;clearCapture();feedback[k].setText("No se pudo leer la foto. Elegí otra imagen.");}});}
        });return true;
    }
    private void submit(boolean consent){
        if(busy||panel==null)return;
        String p=UruguayPlate.compact(plate.getText().toString());
        if(p.isEmpty()){plate.requestFocus();plate.setError("Usá AAA-1234");msg("Ingresá una matrícula válida (ej. SBG-1234).");return;}
        if(make.getText().toString().trim().isEmpty()||model.getText().toString().trim().isEmpty()||color.getText().toString().trim().isEmpty()){msg("Completá marca, modelo y color.");return;}
        int y;try{y=Integer.parseInt(year.getText().toString());}catch(Exception ex){year.setError("Ingresá cuatro números");return;}
        if(y<1900||y>Calendar.getInstance().get(Calendar.YEAR)+1){year.setError("Año inválido");return;}
        if(Arrays.stream(jpeg).anyMatch(String::isEmpty)||!consent){msg("Agregá las tres fotos y autorizá su uso.");return;}
        String mismatch=(!plates[0].isEmpty()&&!plates[0].equals(p))||(!plates[1].isEmpty()&&!plates[1].equals(p))?" Las lecturas no coinciden con la matrícula escrita. Administración deberá revisarlo.":"";
        new AlertDialog.Builder(a).setTitle("Confirmá la matrícula").setMessage(UruguayPlate.format(p)+" · "+make.getText()+" "+model.getText()+"."+mismatch)
          .setNegativeButton("Corregir",null).setPositiveButton("Enviar",(d,w)->send(p)).show();
    }
    private void send(String p){
        if(busy||panel==null)return;int e=epoch;Dialog owner=panel;busy=true;
        try{
            JSONObject payload=new JSONObject().put("plate",p).put("make",make.getText().toString()).put("model",model.getText().toString()).put("color",color.getText().toString()).put("year",Integer.parseInt(year.getText().toString())).put("consent",true)
             .put("photos",new JSONObject().put("driver",jpeg[0]).put("front",jpeg[1]).put("rear",jpeg[2]))
             .put("recognition",new JSONObject().put("face",signal[0]).put("front",signal[1]).put("rear",signal[2]).put("frontPlate",plates[0]).put("rearPlate",plates[1]));
            api.call("POST",PATH,payload,(status,body,error)->{if(!alive(e)||panel!=owner)return;busy=false;
                if(status==201){try{meta=new JSONObject(body);}catch(Exception ignored){}nextReminder=SystemClock.elapsedRealtime()+REMIND;owner.dismiss();msg("Ficha recibida. Pendiente de revisión.");}else msg(error.isEmpty()?"No se pudo guardar la ficha":error);
            });
        }catch(Exception e1){busy=false;msg("No se pudo preparar la ficha.");}
    }
    void reviewList(){
        if(account.isEmpty()||review!=null)return;int e=epoch;
        api.call("GET",ADMIN,null,(status,body,error)->{
            if(!alive(e))return;if(status!=200){msg("Revisión no disponible. "+error);return;}
            try{JSONArray rows=new JSONObject(body).getJSONArray("profiles");LinearLayout l=column();
                if(rows.length()==0)line(l,"No hay fichas registradas.",15,MUTED,false);
                for(int i=0;i<rows.length();i++){JSONObject r=rows.getJSONObject(i);LinearLayout card=section(l);line(card,statusLabel(r.optString("state")),12,TEAL,true);action(card,r.optString("name")+" · "+UruguayPlate.format(r.optString("plate")),false,()->reviewOne(r.optString("id")));}
                Dialog d=page("Revisar fichas",l);review=d;d.setOnDismissListener(x->{if(review==d)review=null;});
            }catch(Exception ex){msg("No se pudo leer la lista.");}
        });
    }
    private void reviewOne(String id){
        int e=epoch;
        api.call("GET",ADMIN+"/"+Uri.encode(id),null,(status,body,error)->{
            if(!alive(e))return;if(status!=200){msg(error);return;}
            try{JSONObject p=new JSONObject(body);if(review!=null)review.dismiss();LinearLayout l=column();
                summary(l,p);history(l,p);
                LinearLayout controls=section(l);line(controls,"Decisión administrativa",17,INK,true);String state=p.optString("state");
                EditText note=neatField(controls,"MOTIVO DE RECTIFICACIÓN O REVOCACIÓN","","Escribí el motivo");
                if(state.equals("pending")){CheckBox checked=new CheckBox(a);checked.setText("Verifiqué identidad, vehículo y matrícula.");controls.addView(checked);action(controls,"Aprobar ficha",true,()->{if(!checked.isChecked()){msg("Confirmá la revisión.");return;}reviewSave(id,p.optString("revision"),"approved","");});}
                if(state.equals("pending")||state.equals("approved"))action(controls,"Solicitar rectificaciones",false,()->reviewSave(id,p.optString("revision"),"rejected",note.getText().toString()));
                if(state.equals("approved"))action(controls,"Revocar aprobación",false,()->{if(note.getText().toString().trim().isEmpty()){msg("Indicá el motivo.");return;}new AlertDialog.Builder(a).setTitle("Revocar aprobación").setMessage("El perfil dejará de estar aprobado.").setNegativeButton("Cancelar",null).setPositiveButton("Revocar",(x,w)->reviewSave(id,p.optString("revision"),"revoked",note.getText().toString())).show();});
                Dialog d=page("Revisión de conductor",l);review=d;d.setOnDismissListener(x->{if(review==d)review=null;});
            }catch(Exception ex){msg("No se pudo mostrar la ficha.");}
        });
    }
    private void reviewSave(String id,String rev,String state,String note){
        if(!state.equals("approved")&&note.trim().isEmpty()){msg("Indicá el motivo.");return;}
        int e=epoch;Dialog owner=review;try{
            api.call("PATCH",ADMIN+"/"+Uri.encode(id),new JSONObject().put("revision",rev).put("state",state).put("note",note),(code,body,error)->{
                if(!alive(e)||review!=owner)return;if(code==200){owner.dismiss();nextReminder=0;msg("Revisión guardada.");reviewList();}else msg(error);
            });
        }catch(Exception ex){msg("No se pudo guardar la revisión.");}
    }
}
