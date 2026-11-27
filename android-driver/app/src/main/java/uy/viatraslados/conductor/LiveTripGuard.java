package uy.viatraslados.conductor;
final class LiveTripGuard {
    static final int OK=0,CANCELLED=1,MISSING=2,CHANGED=3;
    private static String normalized(String s){return s==null||"null".equals(s)?"":s;}
    static int check(String state,String assignment,boolean quoting,boolean wasQuote,boolean wasRelease,
        boolean present,String currentState,String currentAssignment,boolean canQuote,boolean canRelease){
        if(!present)return MISSING;
        if("cancelled".equals(currentState)&&!"cancelled".equals(state))return CANCELLED;
        if(!state.equals(currentState)||!normalized(assignment).equals(normalized(currentAssignment)))return CHANGED;
        if(quoting&&(!"requested".equals(currentState)||!canQuote))return CHANGED;
        if(!quoting&&(wasQuote!=canQuote||wasRelease!=canRelease))return CHANGED;
        return OK;
    }
}
