package uy.viatraslados.conductor;
public final class LiveTripGuardTest {
    static void eq(int actual,int expected){if(actual!=expected)throw new AssertionError(actual+" != "+expected);}
    public static void main(String[] args){
        eq(LiveTripGuard.check("requested","",true,true,false,true,"requested","null",true,false),0);
        eq(LiveTripGuard.check("requested","",true,true,false,true,"cancelled","",false,false),1);
        eq(LiveTripGuard.check("requested","",true,true,false,false,"","",false,false),2);
        eq(LiveTripGuard.check("requested","",true,true,false,true,"quoted","other",false,false),3);
        eq(LiveTripGuard.check("requested","",true,true,false,true,"requested","",false,false),3);
        eq(LiveTripGuard.check("accepted","a",false,false,false,true,"cancelled","a",false,false),1);
        eq(LiveTripGuard.check("accepted","a",false,false,false,true,"confirmed","a",false,false),3);
        eq(LiveTripGuard.check("accepted","a",false,false,false,true,"accepted","b",false,false),3);
        eq(LiveTripGuard.check("cancelled","a",false,false,false,true,"cancelled","a",false,false),0);
        System.out.println("VIA_LIVE_TRIP_GUARD_PASS");
    }
}
