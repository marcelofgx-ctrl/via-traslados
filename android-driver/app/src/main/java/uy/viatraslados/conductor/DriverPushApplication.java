package uy.viatraslados.conductor;
public final class DriverPushApplication extends android.app.Application {
    @Override public void onCreate(){super.onCreate();DriverPush.init(this);}
}
