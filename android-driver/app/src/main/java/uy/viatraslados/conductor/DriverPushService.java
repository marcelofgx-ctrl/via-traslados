package uy.viatraslados.conductor;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
public final class DriverPushService extends FirebaseMessagingService {
    @Override public void onMessageReceived(RemoteMessage message){
        if("new_request".equals(message.getData().get("kind")))
            DriverPush.notifyRequest(this,message.getData().get("bookingId"),message.getData().get("deviceId"));
    }
    @Override public void onNewToken(String token){
        // Refresh registration on next authenticated launch; do not store a bearer token unencrypted.
        getSharedPreferences("via_driver_push_v1",MODE_PRIVATE).edit().putBoolean("token_dirty",true).apply();
    }
}
