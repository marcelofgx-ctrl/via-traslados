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
    private EditText plate,make,model,color;
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
    private boolean incomplete(){String s=meta.optString("state");return s.equals("missing")||s.equals("rejected")||s.equals("vehicle_changed");}
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
              .setPositiveButton("Completar ahora",(x,w)->showForm()).setNegativeButton("Más tarde",null).create();
            reminder=d;d.setOnDismissListener(x->{if(reminder==d)reminder=null;});d.show();
        });
    }
    void open(){
        if(account.isEmpty()||panel!=null)return;int e=epoch;
        api.call("GET",PATH,null,(status,body,error)->{
            if(!alive(e))return;if(status!=200){msg("Ficha no disponible. "+error);return;}
            try{meta=new JSONObject(body);}catch(Exception ex){msg("Respuesta de ficha inválida");return;}showForm();
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
        button(outer,"‹ Volver",d::dismiss);line(outer,title,23,INK,true);
        ScrollView scroll=new ScrollView(a);scroll.setFillViewport(false);scroll.addView(content);outer.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        d.setContentView(outer);d.show();if(d.getWindow()!=null)d.getWindow().setLayout(-1,-1);return d;
    }
    private void showForm(){
        if(panel!=null||account.isEmpty())return;
        LinearLayout l=column();
        line(l,"QA · Usá únicamente fotografías y datos de prueba.",12,MUTED,true);
        String state=meta.optString("state","missing");
        if(state.equals("approved")||state.equals("pending")){
            line(l,state.equals("approved")?"Ficha aprobada":"En revisión administrativa",17,TEAL,true);
            line(l,"Matrícula: "+meta.optString("plate")+" · "+meta.optString("make")+" "+meta.optString("model"),14,INK,false);
            line(l,"Si cambiaste de vehículo o necesitás actualizar las fotos, enviá las tres imágenes nuevamente. La ficha anterior dejará de mostrarse hasta la revisión.",13,MUTED,false);
        }
        if(state.equals("rejected"))line(l,meta.optString("reviewNote"),14,INK,true);
        JSONObject old=meta.optJSONObject("vehicle");if(old==null)old=new JSONObject();
        make=field(l,"MARCA",meta.optString("make",old.optString("make")));model=field(l,"MODELO",meta.optString("model",old.optString("model")));color=field(l,"COLOR",meta.optString("color"));plate=field(l,"MATRÍCULA · confirmá la lectura",meta.optString("plate",old.optString("plate")));
        String[] title={"Foto del conductor","Frente del automóvil","Parte trasera del automóvil"};
        String[] hint={"Una sola cara, bien iluminada.","Automóvil completo con matrícula visible.","Mismo vehículo, matrícula visible."};
        for(int i=0;i<3;i++){
            final int k=i;line(l,title[i],17,INK,true);line(l,hint[i],13,MUTED,false);
            ImageView image=new ImageView(a);image.setScaleType(ImageView.ScaleType.FIT_CENTER);image.setBackgroundColor(SOFT);l.addView(image,new LinearLayout.LayoutParams(-1,dp(118)));previews[i]=image;
            feedback[i]=line(l,"Pendiente",12,MUTED,false);button(l,"Tomar foto o elegir imagen",()->choose(k));
        }
        CheckBox consent=new CheckBox(a);consent.setText("Autorizo mostrar mi foto, las del vehículo y su matrícula únicamente a pasajeros de mis reservas confirmadas activas.");l.addView(consent);
        button(l,"Enviar ficha para revisión",()->submit(consent.isChecked()));
        Dialog d=page("Mi ficha de conductor",l);panel=d;
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
                    if(k>0){plates[k-1]=r.plate;if(plate.getText().toString().trim().isEmpty()&&!r.plate.isEmpty())plate.setText(r.plate);}
                });
            }catch(Exception ex){ui.post(()->{if(alive(e)&&panel==owner){busy=false;clearCapture();feedback[k].setText("No se pudo leer la foto. Elegí otra imagen.");}});}
        });return true;
    }
    private void submit(boolean consent){
        if(busy||panel==null)return;
        String p=plate.getText().toString().toUpperCase(Locale.ROOT).replaceAll("[ -]","");
        if(!p.matches("[A-Z]{3}[0-9]{4}")||make.length()==0||model.length()==0||color.length()==0){msg("Completá marca, modelo, color y matrícula.");return;}
        if(Arrays.stream(jpeg).anyMatch(String::isEmpty)||!consent){msg("Agregá las tres fotos y autorizá su uso.");return;}
        String mismatch=(!plates[0].isEmpty()&&!plates[0].equals(p))||(!plates[1].isEmpty()&&!plates[1].equals(p))?" Las lecturas no coinciden con la matrícula escrita. Administración deberá revisarlo.":"";
        new AlertDialog.Builder(a).setTitle("Confirmá la matrícula").setMessage(p.substring(0,3)+" "+p.substring(3)+" · "+make.getText()+" "+model.getText()+"."+mismatch)
          .setNegativeButton("Corregir",null).setPositiveButton("Enviar",(d,w)->send(p)).show();
    }
    private void send(String p){
        if(busy||panel==null)return;int e=epoch;Dialog owner=panel;busy=true;
        try{
            JSONObject payload=new JSONObject().put("plate",p).put("make",make.getText().toString()).put("model",model.getText().toString()).put("color",color.getText().toString()).put("consent",true)
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
                if(rows.length()==0)line(l,"No hay fichas pendientes.",15,MUTED,false);
                for(int i=0;i<rows.length();i++){JSONObject r=rows.getJSONObject(i);button(l,r.optString("name")+" · "+r.optString("plate"),()->reviewOne(r.optString("id")));}
                Dialog d=page("Revisar fichas",l);review=d;d.setOnDismissListener(x->{if(review==d)review=null;});
            }catch(Exception ex){msg("No se pudo leer la lista.");}
        });
    }
    private void reviewOne(String id){
        int e=epoch;
        api.call("GET",ADMIN+"/"+Uri.encode(id),null,(status,body,error)->{
            if(!alive(e))return;if(status!=200){msg(error);return;}
            try{JSONObject p=new JSONObject(body);if(review!=null)review.dismiss();LinearLayout l=column();
                line(l,p.optString("name"),19,INK,true);line(l,p.optString("plate")+" · "+p.optString("make")+" "+p.optString("model")+" · "+p.optString("color"),15,INK,false);
                line(l,"Comprobá el rostro, las dos vistas, el vehículo declarado y la matrícula. Las señales del teléfono no son prueba de identidad.",13,MUTED,false);
                JSONObject photos=p.getJSONObject("photos");for(String k:new String[]{"driver","front","rear"}){
                    line(l,k.equals("driver")?"Conductor":k.equals("front")?"Frente":"Trasera",14,TEAL,true);
                    byte[] bytes=Base64.decode(photos.getString(k),Base64.DEFAULT);ImageView img=new ImageView(a);img.setImageBitmap(BitmapFactory.decodeByteArray(bytes,0,bytes.length));img.setScaleType(ImageView.ScaleType.FIT_CENTER);l.addView(img,new LinearLayout.LayoutParams(-1,dp(200)));
                }
                JSONObject r=p.optJSONObject("recognition");if(r!=null)line(l,"Señales: "+r.optString("face")+" / "+r.optString("front")+" / "+r.optString("rear")+" · OCR "+r.optString("frontPlate")+" / "+r.optString("rearPlate"),12,MUTED,false);
                EditText note=field(l,"Motivo si rechazás","");
                CheckBox checked=new CheckBox(a);checked.setText("Revisé personalmente las fotos y la matrícula.");l.addView(checked);
                button(l,"Aprobar ficha",()->{if(!checked.isChecked()){msg("Confirmá la revisión.");return;}reviewSave(id,p.optString("revision"),"approved","");});
                button(l,"Solicitar correcciones",()->reviewSave(id,p.optString("revision"),"rejected",note.getText().toString()));
                Dialog d=page("Revisión de conductor",l);review=d;d.setOnDismissListener(x->{if(review==d)review=null;});
            }catch(Exception ex){msg("No se pudo mostrar la ficha.");}
        });
    }
    private void reviewSave(String id,String rev,String state,String note){
        if(state.equals("rejected")&&note.trim().isEmpty()){msg("Indicá el motivo.");return;}
        int e=epoch;Dialog owner=review;try{
            api.call("PATCH",ADMIN+"/"+Uri.encode(id),new JSONObject().put("revision",rev).put("state",state).put("note",note),(code,body,error)->{
                if(!alive(e)||review!=owner)return;if(code==200){owner.dismiss();nextReminder=0;msg("Revisión guardada.");reviewList();}else msg(error);
            });
        }catch(Exception ex){msg("No se pudo guardar la revisión.");}
    }
}
