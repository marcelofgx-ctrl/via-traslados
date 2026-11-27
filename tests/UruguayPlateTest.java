package uy.viatraslados.conductor;
public final class UruguayPlateTest {
 static void eq(String actual,String expected){if(!actual.equals(expected))throw new AssertionError(actual+" != "+expected);}
 public static void main(String[] args){
  eq(UruguayPlate.format("sbg1234"),"SBG-1234");eq(UruguayPlate.format("ABC 1234"),"ABC-1234");
  eq(UruguayPlate.format("abc-123456"),"ABC-1234");eq(UruguayPlate.format("a1b2cD-1234"),"ABC-1234");
  eq(UruguayPlate.format("ABC-"),"ABC");eq(UruguayPlate.format("AB"),"AB");
  eq(UruguayPlate.format("ABC-12"),"ABC-12");eq(UruguayPlate.compact("ABC-1234"),"ABC1234");
  if(UruguayPlate.valid("ABC1234")||UruguayPlate.valid("AB-1234")||UruguayPlate.valid("ABC-123"))throw new AssertionError("Invalid accepted");
  System.out.println("VIA_URUGUAY_PLATE_PASS");
 }
}
