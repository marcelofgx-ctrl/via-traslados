package uy.viatraslados.conductor;
import android.graphics.Bitmap;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.face.*;
import com.google.mlkit.vision.label.*;
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions;
import com.google.mlkit.vision.text.*;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import com.google.android.gms.tasks.Tasks;
import java.util.*;
import java.util.regex.*;
final class DriverPhotoRecognition {
    static final class Result {
        final String state,plate,message;final boolean reject;
        Result(String s,String p,String m,boolean r){state=s;plate=p;message=m;reject=r;}
    }
    static String plateFrom(String s){
        Set<String> plates=new HashSet<>();
        Matcher m=Pattern.compile("(?<![A-Z0-9])([A-Z]{3})[ \\t-]*([0-9]{4})(?![A-Z0-9])").matcher(s.toUpperCase(Locale.ROOT));
        while(m.find())plates.add(m.group(1)+m.group(2));
        return plates.size()==1?plates.iterator().next():"";
    }
    static Result inspect(Bitmap bitmap,int slot){
        InputImage image=InputImage.fromBitmap(bitmap,0);
        if(slot==0){
            FaceDetector detector=FaceDetection.getClient(new FaceDetectorOptions.Builder().setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE).build());
            try{
                List<Face> faces=Tasks.await(detector.process(image),20,java.util.concurrent.TimeUnit.SECONDS);
                if(faces.size()!=1)return new Result("review","","Se necesita una sola cara visible. Probá otra foto.",true);
                android.graphics.Rect r=faces.get(0).getBoundingBox();
                boolean clear=r.width()>=100&&r.height()>=100;
                return new Result(clear?"pass":"review","",clear?"Rostro detectado":"Rostro pequeño: acercate o solicitá revisión.",false);
            }catch(Exception e){return new Result("review","","No se pudo analizar el rostro. Intentá nuevamente.",true);}
            finally{detector.close();}
        }
        boolean car=false,moto=false;String plate="";
        ImageLabeler labeler=ImageLabeling.getClient(new ImageLabelerOptions.Builder().setConfidenceThreshold(.50f).build());
        try{
            for(ImageLabel label:Tasks.await(labeler.process(image),20,java.util.concurrent.TimeUnit.SECONDS)){
                String n=label.getText().toLowerCase(Locale.ROOT);
                if(n.matches(".*\\b(car|automobile|sedan|suv|minivan|van|truck|motor vehicle)\\b.*")&&label.getConfidence()>=.60f)car=true;
                if(n.matches(".*\\b(motorcycle|motorbike|moped|scooter|bicycle)\\b.*")&&label.getConfidence()>=.75f)moto=true;
            }
        }catch(Exception ignored){}finally{labeler.close();}
        if(!car)return new Result("review","","No se detectó un automóvil con suficiente confianza. Tomá otra foto del vehículo completo.",true);
        TextRecognizer reader=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        try{plate=plateFrom(Tasks.await(reader.process(image),20,java.util.concurrent.TimeUnit.SECONDS).getText());}catch(Exception ignored){}finally{reader.close();}
        return new Result(car?"pass":"review",plate,(car?"Automóvil probable":"Vehículo no concluyente: revisión manual")+(plate.isEmpty()?" · Matrícula no detectada":" · "+plate),false);
    }
}
