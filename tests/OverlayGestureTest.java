package uy.viatraslados.conductor;
public final class OverlayGestureTest {
    private static void expect(int actual,int expected){if(actual!=expected)throw new AssertionError(actual+" != "+expected);}
    public static void main(String[] args){
        expect(OverlayGesture.resolve(-48,3,14,false),OverlayGesture.EXPAND);
        expect(OverlayGesture.resolve(48,-3,14,false),OverlayGesture.COLLAPSE);
        expect(OverlayGesture.resolve(2,3,14,true),OverlayGesture.TOGGLE);
        expect(OverlayGesture.resolve(2,3,14,false),OverlayGesture.NONE);
        expect(OverlayGesture.resolve(4,60,14,true),OverlayGesture.NONE);
        System.out.println("VIA_OVERLAY_GESTURES_PASS");
    }
}
