package uy.viatraslados.conductor;
import java.util.Locale;
final class UruguayPlate {
 static String format(String input){
  StringBuilder out=new StringBuilder();
  String s=input==null?"":input.toUpperCase(Locale.ROOT);
  for(int i=0;i<s.length()&&out.length()<8;i++){
   char c=s.charAt(i);
   if(out.length()<3){if(c>='A'&&c<='Z')out.append(c);}
   else if(c>='0'&&c<='9'){if(out.length()==3)out.append('-');out.append(c);}
  }
  return out.toString();
 }
 static boolean valid(String s){return s!=null&&s.matches("[A-Z]{3}-[0-9]{4}");}
 static String compact(String s){return valid(s)?s.replace("-",""):"";}
}
