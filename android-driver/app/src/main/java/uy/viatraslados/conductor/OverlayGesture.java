package uy.viatraslados.conductor;
/** Screen-coordinate swipe classification, independent of window and Activity. */
final class OverlayGesture {
    static final int NONE=0,EXPAND=1,COLLAPSE=2,TOGGLE=3;
    static int resolve(float dy,float dx,float slop,boolean released){
        if(Math.abs(dy)>=slop&&Math.abs(dy)>Math.abs(dx))return dy<0?EXPAND:COLLAPSE;
        if(released&&Math.abs(dy)<slop&&Math.abs(dx)<slop)return TOGGLE;
        return NONE;
    }
}
