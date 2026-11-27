package uy.viatraslados.conductor;
import android.content.Context;
import android.graphics.*;
import android.view.View;

/** Small original line glyphs drawn at dp-independent scale. */
final class AlertGlyph extends View {
    private final String kind;private final Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);
    AlertGlyph(Context context,String kind,int color){super(context);this.kind=kind;p.setColor(color);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(1.7f);p.setStrokeCap(Paint.Cap.ROUND);p.setStrokeJoin(Paint.Join.ROUND);setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);}
    @Override protected void onDraw(Canvas c){super.onDraw(c);float scale=Math.min(getWidth(),getHeight())/24f;c.save();c.translate((getWidth()-24*scale)/2,(getHeight()-24*scale)/2);c.scale(scale,scale);
        Path a=new Path();
        switch(kind){
        case "bell":a.moveTo(4,17);a.lineTo(6,14);a.lineTo(6,9);a.cubicTo(6,5,9,3,12,3);a.cubicTo(15,3,18,5,18,9);a.lineTo(18,14);a.lineTo(20,17);a.close();c.drawPath(a,p);c.drawArc(9,17,15,22,0,180,false,p);c.drawLine(12,1,12,3,p);break;
        case "calendar":c.drawRoundRect(3,5,21,21,2,2,p);c.drawLine(3,10,21,10,p);c.drawLine(8,3,8,7,p);c.drawLine(16,3,16,7,p);break;
        case "clock":c.drawCircle(12,12,9,p);c.drawLine(12,6,12,12,p);c.drawLine(12,12,16,14,p);break;
        case "route":c.drawCircle(5,18,3,p);c.drawCircle(19,5,3,p);a.moveTo(8,18);a.cubicTo(20,18,6,5,16,5);c.drawPath(a,p);break;
        case "car":c.drawRoundRect(3,11,21,19,2,2,p);a.moveTo(5,11);a.lineTo(7,6);a.lineTo(17,6);a.lineTo(19,11);c.drawPath(a,p);c.drawLine(6,19,6,22,p);c.drawLine(18,19,18,22,p);c.drawLine(6,15,8,15,p);c.drawLine(16,15,18,15,p);break;
        default:c.drawCircle(9,7,3,p);c.drawCircle(17,8,2.5f,p);a.moveTo(3,20);a.lineTo(3,17);a.cubicTo(3,11,15,11,15,17);a.lineTo(15,20);c.drawPath(a,p);a.reset();a.moveTo(16,13);a.cubicTo(20,13,22,15,22,19);c.drawPath(a,p);break;
        }c.restore();
    }
}
