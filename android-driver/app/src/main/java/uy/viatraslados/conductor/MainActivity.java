package uy.viatraslados.conductor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String API = "https://via-traslados-api.marcelof-gx.workers.dev";
    private static final int TEAL = Color.rgb(9, 126, 121);
    private static final int INK = Color.rgb(24, 43, 49);
    private static final int MUTED = Color.rgb(109, 128, 134);
    private static final int LIGHT = Color.rgb(244, 248, 247);
    private static final int ORANGE = Color.rgb(211, 110, 43);
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private LinearLayout root;
    private String operatorKey;
    private String staffToken;
    private String staffRole = "driver";
    private String staffName = "";
    private JSONArray approvedDrivers = new JSONArray();
    private boolean siteEnabled = true;
    private boolean adminLoaded = false;
    private JSONArray managedDrivers = new JSONArray();
    private JSONArray bookings = new JSONArray();
    private String lastPayload = "";
    private String tab = "solicitudes";
    private String subtab = "nuevas";
    private boolean loading = false;
    private boolean visible = false;
    private final Runnable poll = new Runnable() {
        @Override public void run() {
            if (visible && (operatorKey != null || staffToken != null)) fetchBookings(false);
            if (visible) handler.postDelayed(this, 30000);
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(LIGHT);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(LIGHT);
        setContentView(root);
        loginScreen();
    }

    @Override protected void onResume() {
        super.onResume();
        visible = true;
        handler.removeCallbacks(poll);
        handler.postDelayed(poll, 30000);
        if (operatorKey != null || staffToken != null) fetchBookings(false);
    }

    @Override protected void onPause() {
        visible = false;
        handler.removeCallbacks(poll);
        super.onPause();
    }

    @Override protected void onDestroy() {
        operatorKey = null;
        staffToken = null;
        executor.shutdownNow();
        super.onDestroy();
    }

    private int dp(float n) { return (int)(n * getResources().getDisplayMetrics().density + 0.5f); }

    private GradientDrawable bg(int fill, int radius, int border) {
        GradientDrawable b = new GradientDrawable();
        b.setColor(fill);
        b.setCornerRadius(dp(radius));
        if (border != 0) b.setStroke(dp(1), border);
        return b;
    }

    private LinearLayout column() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    private LinearLayout row() {
        LinearLayout l = new LinearLayout(this);
        l.setGravity(Gravity.CENTER_VERTICAL);
        l.setOrientation(LinearLayout.HORIZONTAL);
        return l;
    }

    private TextView text(String s, float size, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(color);
        t.setTextSize(size);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return t;
    }

    private void addLine(LinearLayout container, String s, float size, int color,
                         boolean bold, int bottom) {
        TextView t = text(s, size, color, bold);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.bottomMargin = dp(bottom);
        container.addView(t, p);
    }

    private Button button(String s, boolean primary, View.OnClickListener click) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextSize(14);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setTextColor(primary ? Color.WHITE : TEAL);
        b.setBackground(bg(primary ? TEAL : Color.WHITE, 14,
            primary ? 0 : Color.rgb(204, 226, 223)));
        b.setPadding(dp(13), dp(8), dp(13), dp(8));
        b.setMinHeight(dp(48));
        b.setOnClickListener(click);
        return b;
    }

    private LinearLayout card() {
        LinearLayout c = column();
        c.setPadding(dp(18), dp(17), dp(18), dp(17));
        c.setBackground(bg(Color.WHITE, 18, Color.rgb(225, 233, 231)));
        c.setElevation(dp(2));
        return c;
    }

    private void appendCard(LinearLayout parent, LinearLayout c, int margin) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.bottomMargin = dp(margin);
        parent.addView(c, p);
    }

    private void spacer(LinearLayout l, int height) {
        View v = new View(this);
        l.addView(v, new LinearLayout.LayoutParams(1, dp(height)));
    }

    private void loginScreen() {
        root.removeAllViews();
        operatorKey = null;
        staffToken = null;
        staffRole = "driver";
        staffName = "";
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout pane = column();
        pane.setPadding(dp(25), dp(56), dp(25), dp(28));
        scroll.addView(pane);

        TextView monogram = text("V", 33, Color.WHITE, true);
        monogram.setGravity(Gravity.CENTER);
        monogram.setBackground(bg(TEAL, 22, 0));
        pane.addView(monogram, new LinearLayout.LayoutParams(dp(70), dp(70)));
        spacer(pane, 25);
        addLine(pane, "Vía Traslados", 30, INK, true, 4);
        addLine(pane, "Panel privado del conductor", 16, MUTED, false, 34);

        LinearLayout authCard = card();
        addLine(authCard, "Acceso del conductor", 22, INK, true, 7);
        addLine(authCard,
            "Ingresá la clave privada que recibiste. Por seguridad no se guarda en el teléfono.",
            14, MUTED, false, 20);
        EditText key = new EditText(this);
        key.setSingleLine(true);
        key.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        key.setHint("Clave del operador");
        key.setTextSize(16);
        key.setPadding(dp(13), dp(9), dp(13), dp(9));
        key.setBackground(bg(LIGHT, 12, Color.rgb(211, 227, 224)));
        authCard.addView(key, new LinearLayout.LayoutParams(-1, dp(54)));
        spacer(authCard, 16);
        Button signIn = button("Ingresar al panel  →", true, v -> {
            String entered = key.getText().toString();
            if (entered.isEmpty()) { key.setError("Ingresá tu clave"); return; }
            operatorKey = entered;
            staffToken = null;
            staffRole = "admin";
            staffName = "Administrador principal";
            adminLoaded = false;
            key.setText("");
            signInPending();
            fetchBookings(true);
        });
        authCard.addView(signIn, new LinearLayout.LayoutParams(-1, dp(54)));
        appendCard(pane, authCard, 15);
        pane.addView(button("Ingresar con usuario y contraseña", false, v -> accountLogin()),
            new LinearLayout.LayoutParams(-1, dp(54)));
        spacer(pane, 11);
        pane.addView(button("Registrarme como conductor", false, v -> driverRegister()),
            new LinearLayout.LayoutParams(-1, dp(54)));
        spacer(pane, 24);
        addLine(pane, "Solo para el conductor autorizado · Vía Traslados", 12, MUTED, false, 10);
        addLine(pane, "No hay comisiones de plataforma ni cargos por cada oferta.",
            12, MUTED, false, 0);
    }

    private void signInPending() {
        root.removeAllViews();
        LinearLayout c = column();
        c.setGravity(Gravity.CENTER);
        root.addView(c, new LinearLayout.LayoutParams(-1, -1));
        TextView t = text("Conectando con Vía Traslados…", 17, TEAL, true);
        t.setGravity(Gravity.CENTER);
        c.addView(t);
    }

    private interface Done { void call(int status, String body, String error); }
    private void api(String method, String path, JSONObject payload, Done done) {
        final String key = operatorKey;
        final String token = staffToken;
        executor.execute(() -> {
            int status = 0;
            String result = "";
            String error = "";
            try {
                okhttp3.Request.Builder builder = new okhttp3.Request.Builder()
                    .url(API + path)
                    .header("Accept", "application/json")
                    .header("Cache-Control", "no-cache");
                if (token != null && !token.isEmpty()) builder.header("Authorization", "Bearer " + token);
                else if (key != null && !key.isEmpty()) builder.header("X-Operator-Key", key);
                if (payload != null) {
                    okhttp3.MediaType media = okhttp3.MediaType.get("application/json; charset=utf-8");
                    okhttp3.RequestBody body = okhttp3.RequestBody.create(payload.toString(), media);
                    builder.method(method, body);
                } else builder.get();
                okhttp3.OkHttpClient client = new okhttp3.OkHttpClient.Builder()
                    .connectTimeout(12, java.util.concurrent.TimeUnit.SECONDS)
                    .readTimeout(16, java.util.concurrent.TimeUnit.SECONDS)
                    .build();
                try (okhttp3.Response response = client.newCall(builder.build()).execute()) {
                    status = response.code();
                    okhttp3.ResponseBody reply = response.body();
                    if (reply != null) {
                        if (reply.contentLength() > 2000000) throw new Exception("Respuesta demasiado grande");
                        result = reply.string();
                        if (result.length() > 2000000) throw new Exception("Respuesta demasiado grande");
                    }
                    if (status >= 400) {
                        JSONObject obj = new JSONObject(result);
                        error = obj.optString("error", "Error del servidor (" + status + ")");
                    }
                }
            } catch (Exception e) {
                error = "No se pudo conectar. Revisá la conexión a Internet.";
            }
            final int code = status;
            final String body = result;
            final String err = error;
            handler.post(() -> { if (!isFinishing()) done.call(code, body, err); });
        });
    }

    private void fetchBookings(boolean login) {
        if ((operatorKey == null && staffToken == null) || loading) return;
        loading = true;
        api("GET", "/api/operator/requests", null, (status, result, error) -> {
            loading = false;
            if (status == 200) {
                try {
                    JSONArray next = new JSONArray(result);
                    bookings = next;
                    if (login || !result.equals(lastPayload)) {
                        lastPayload = result;
                        dashboard();
                    }
                } catch (Exception e) {
                    message("El servidor devolvió un formato incorrecto.");
                    if (login) loginScreen();
                }
            } else if (status == 401 || status == 403) {
                if (login) {
                    loginScreen();
                    new AlertDialog.Builder(this).setTitle("No se pudo ingresar")
                      .setMessage("Clave incorrecta o acceso no autorizado.")
                      .setPositiveButton("Entendido", null).show();
                } else {
                    message("La sesión dejó de estar autorizada.");
                    loginScreen();
                }
            } else {
                message(error.isEmpty() ? "No fue posible actualizar las solicitudes." : error);
                if (login) loginScreen();
            }
        });
    }

    private void dashboard() {
        if (operatorKey == null && staffToken == null) return;
        root.removeAllViews();
        LinearLayout header = row();
        header.setPadding(dp(17), dp(13), dp(17), dp(13));
        header.setBackgroundColor(Color.WHITE);
        LinearLayout brand = column();
        addLine(brand, "Vía Traslados", 21, INK, true, 0);
        addLine(brand, "admin".equals(staffRole) ? "ADMINISTRADOR · EN LÍNEA" : "CONDUCTOR · EN LÍNEA", 11, TEAL, true, 0);
        header.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));
        Button refresh = button("↻", false, v -> fetchBookings(true));
        refresh.setMinWidth(dp(48));
        header.addView(refresh, new LinearLayout.LayoutParams(dp(52), dp(46)));
        root.addView(header, new LinearLayout.LayoutParams(-1, -2));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout content = column();
        content.setPadding(dp(17), dp(19), dp(17), dp(20));
        scroll.addView(content);

        if ("administrar".equals(tab)) manage(content);
        else if ("ajustes".equals(tab)) settings(content);
        else if ("historial".equals(tab)) lists(content, "historial");
        else if ("viajes".equals(tab)) lists(content, "viajes");
        else lists(content, "solicitudes");
        navigation();
    }

    private int count(String status) {
        int n=0;
        for (int i=0;i<bookings.length();i++)
            if (status.equals(bookings.optJSONObject(i).optString("status"))) n++;
        return n;
    }

    private void lists(LinearLayout body, String mode) {
        if ("solicitudes".equals(mode)) {
            addLine(body, "Solicitudes", 27, INK, true, 3);
            addLine(body, "Cotizá cada traslado y enviá tu propuesta.", 14, MUTED, false, 17);
            LinearLayout filters = row();
            Button a = button("Nuevas (" + count("requested") + ")",
                 "nuevas".equals(subtab), v -> { subtab="nuevas"; dashboard(); });
            Button b = button("Con ofertas (" + count("quoted") + ")",
                 "ofertas".equals(subtab), v -> { subtab="ofertas"; dashboard(); });
            filters.addView(a, new LinearLayout.LayoutParams(0, dp(50), 1));
            LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(0, dp(50), 1);
            bp.leftMargin = dp(8);
            filters.addView(b, bp);
            body.addView(filters);
            spacer(body, 18);
        } else if ("viajes".equals(mode)) {
            addLine(body, "Mis viajes", 27, INK, true, 5);
            addLine(body, "Servicios aceptados y próximos traslados.", 14, MUTED, false, 17);
        } else {
            addLine(body, "Historial", 27, INK, true, 5);
            addLine(body, "Traslados finalizados o cancelados.", 14, MUTED, false, 17);
        }

        int shown = 0;
        for (int i = 0; i < bookings.length(); i++) {
            JSONObject item = bookings.optJSONObject(i);
            if (item == null) continue;
            String status = item.optString("status");
            boolean include;
            if ("solicitudes".equals(mode)) {
                include = "nuevas".equals(subtab) ? "requested".equals(status) : "quoted".equals(status);
            } else if ("historial".equals(mode)) {
                include = "completed".equals(status) || "cancelled".equals(status);
            } else {
                include = "accepted".equals(status) || "confirmed".equals(status)
                    || "en_route".equals(status) || "arrived".equals(status)
                    || "in_progress".equals(status);
            }
            if (include) { bookingCard(body, item); shown++; }
        }
        if (shown == 0) {
            LinearLayout empty = card();
            addLine(empty, "Sin solicitudes por ahora", 18, INK, true, 6);
            addLine(empty, "Cuando haya movimientos aparecerán acá. Podés actualizar con ↻.",
                14, MUTED, false, 0);
            appendCard(body, empty, 14);
        }
        addLine(body, "Actualización automática cada 30 segundos mientras la aplicación está abierta.",
            12, MUTED, false, 0);
    }

    private void bookingCard(LinearLayout parent, JSONObject item) {
        LinearLayout c = card();
        LinearLayout top = row();
        String date = item.optString("date",""), time=item.optString("time","");
        TextView when = text(date + " · " + time, 14, INK, true);
        top.addView(when, new LinearLayout.LayoutParams(0,-2,1));
        TextView st = text(statusName(item.optString("status")), 12, stateColor(item.optString("status")), true);
        st.setGravity(Gravity.CENTER);
        st.setPadding(dp(10),dp(7),dp(10),dp(7));
        st.setBackground(bg(Color.rgb(240, 248, 246), 20, 0));
        top.addView(st);
        c.addView(top);
        spacer(c, 7);
        addLine(c, "Solicitud " + item.optString("id"), 11, MUTED, false, 15);
        addLine(c, "●   " + item.optString("origin"), 15, INK, true, 9);
        addLine(c, "↓", 15, TEAL, true, 6);
        addLine(c, "●   " + item.optString("destination"), 15, INK, true, 14);
        int price = item.optInt("price",0);
        addLine(c, item.optInt("passengers",1) + " pasajero(s) · "
          + item.optInt("bags",0) + " valija(s)"
          + (price>0?" · Oferta $" + price + " UYU":""), 13, MUTED, false, 11);
        Button view = button("Ver solicitud  →", false, v -> details(item));
        c.addView(view,new LinearLayout.LayoutParams(-1,dp(46)));
        if ("requested".equals(item.optString("status"))) {
            spacer(c, 8);
            Button quote = button("Sugerir precio", true, v -> quote(item));
            c.addView(quote,new LinearLayout.LayoutParams(-1,dp(46)));
        }
        appendCard(parent,c,13);
    }

    private static String statusName(String state) {
        switch (state) {
            case "requested": return "Nueva";
            case "quoted": return "Oferta enviada";
            case "accepted": return "Aceptada";
            case "confirmed": return "Confirmada";
            case "en_route": return "En camino";
            case "arrived": return "En origen";
            case "in_progress": return "En viaje";
            case "completed": return "Finalizada";
            case "cancelled": return "Cancelada";
            default: return state;
        }
    }

    private int stateColor(String state) {
        return "requested".equals(state) ? ORANGE : TEAL;
    }

    private void details(JSONObject item) {
        ScrollView scroll = new ScrollView(this);
        LinearLayout body = column();
        body.setPadding(dp(22),dp(10),dp(22),dp(16));
        scroll.addView(body);
        addLine(body, item.optString("id"), 15, TEAL, true, 12);
        addLine(body, statusName(item.optString("status")), 17, INK, true, 13);
        addLine(body, "FECHA Y HORA", 11, MUTED, true, 4);
        addLine(body, item.optString("date") + "  ·  " + item.optString("time"),
            17, INK, true, 16);
        addLine(body, "ORIGEN", 11, MUTED, true, 4);
        addLine(body, item.optString("origin"), 16, INK, true, 13);
        addLine(body, "DESTINO", 11, MUTED, true, 4);
        addLine(body, item.optString("destination"), 16, INK, true, 13);
        addLine(body, "PASAJEROS Y EQUIPAJE", 11, MUTED, true, 4);
        addLine(body, item.optInt("passengers",1) + " pasajero(s), " +
            item.optInt("bags",0) + " valija(s)", 15, INK, false, 13);
        String notes = item.optString("notes","");
        if (!notes.isEmpty() && !"null".equals(notes)) {
            addLine(body,"INDICACIONES",11,MUTED,true,4);
            addLine(body,notes,15,INK,false,13);
        }
        int price = item.optInt("price",0);
        if (price>0) addLine(body,"Precio ofrecido: $" + price + " UYU",
                           18,TEAL,true,14);
        addLine(body,"PASAJERO",11,MUTED,true,4);
        addLine(body,item.optString("name","Sin nombre"),15,INK,true,3);
        addLine(body,item.optString("phone",""),14,MUTED,false,3);
        addLine(body,item.optString("email",""),13,MUTED,false,14);
        if ("admin".equals(staffRole) && ("requested".equals(item.optString("status")) || "quoted".equals(item.optString("status")))) {
            Button assign=button("Asignar conductor",true,v->driverAssignmentDialog(item));
            body.addView(assign,new LinearLayout.LayoutParams(-1,dp(50)));
            spacer(body,8);
        }
        Button map=button("Abrir ruta en Google Maps", false, v -> openMaps(item));
        body.addView(map,new LinearLayout.LayoutParams(-1,dp(50)));
        spacer(body,8);
        String phone = item.optString("phone","");
        if (!phone.isEmpty()) {
            Button call=button("Llamar al pasajero", false, v -> {
                try { startActivity(new Intent(Intent.ACTION_DIAL,
                    Uri.parse("tel:" + Uri.encode(phone)))); }
                catch (Exception e) { message("No se encontró una app de teléfono."); }
            });
            body.addView(call,new LinearLayout.LayoutParams(-1,dp(50)));
            spacer(body,8);
        }
        String state=item.optString("status");
        if ("requested".equals(state)) {
            body.addView(button("Sugerir precio en pesos",true,v->quote(item)),
                new LinearLayout.LayoutParams(-1,dp(50)));
        }
        String next="",title="";
        switch(state) {
            case "accepted": next="confirmed";title="Confirmar servicio";break;
            case "confirmed": next="en_route";title="Salir hacia el pasajero";break;
            case "en_route": next="arrived";title="Marcar llegada al origen";break;
            case "arrived": next="in_progress";title="Iniciar traslado";break;
            case "in_progress": next="completed";title="Finalizar traslado";break;
        }
        if (!next.isEmpty()) {
            String target=next;
            String actionTitle=title;
            spacer(body,8);
            body.addView(button(actionTitle,true,v->confirmStatus(item,target,actionTitle)),
                new LinearLayout.LayoutParams(-1,dp(50)));
        }
        if ("requested".equals(state)||"quoted".equals(state)||
            "accepted".equals(state)||"confirmed".equals(state)||
            "en_route".equals(state)||"arrived".equals(state)) {
            spacer(body,9);
            body.addView(button("Cancelar solicitud",false,v->confirmStatus(item,"cancelled","Cancelar solicitud")),
                new LinearLayout.LayoutParams(-1,dp(50)));
        }
        new AlertDialog.Builder(this)
           .setTitle("Detalle del traslado")
           .setView(scroll)
           .setNegativeButton("Cerrar",null)
           .show();
    }

    private void openMaps(JSONObject item) {
        try {
            String origin=URLEncoder.encode(item.optString("origin"),"UTF-8");
            String dest=URLEncoder.encode(item.optString("destination"),"UTF-8");
            String url="https://www.google.com/maps/dir/?api=1&origin="
                +origin+"&destination="+dest+"&travelmode=driving";
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch(Exception e) { message("No fue posible abrir el mapa."); }
    }

    private void quote(JSONObject item) {
        EditText price = new EditText(this);
        price.setInputType(InputType.TYPE_CLASS_NUMBER);
        price.setSingleLine(true);
        price.setTextSize(20);
        price.setHint("Importe en UYU");
        LinearLayout wrap=column();
        wrap.setPadding(dp(23),dp(10),dp(23),dp(5));
        wrap.addView(price);
        new AlertDialog.Builder(this).setTitle("Sugerir precio")
          .setMessage("El pasajero recibirá una propuesta para decidir si la acepta. No se cobra comisión.")
          .setView(wrap)
          .setNegativeButton("Cancelar",null)
          .setPositiveButton("Enviar propuesta",(dialog,which)->{
              try {
                  long value=Long.parseLong(price.getText().toString().trim());
                  if (value<1 || value>10000000) { message("Importe fuera de rango."); return; }
                  JSONObject patch=new JSONObject();
                  patch.put("status","quoted");
                  patch.put("price",value);
                  change(item,patch);
              }catch(Exception e){message("Ingresá un importe válido en pesos uruguayos.");}
          }).show();
    }

    private void confirmStatus(JSONObject item,String next,String title) {
        new AlertDialog.Builder(this).setTitle(title)
          .setMessage("¿Confirmás este cambio de estado para " + item.optString("id") + "?")
          .setNegativeButton("Volver",null)
          .setPositiveButton("Confirmar",(d,w)->{
              try {
                  JSONObject patch=new JSONObject();
                  patch.put("status",next);
                  change(item,patch);
              }catch(Exception e){message("No se pudo preparar la solicitud.");}
          }).show();
    }

    private void change(JSONObject item,JSONObject patch) {
        String path="/api/operator/requests/" + Uri.encode(item.optString("id"));
        api("PATCH",path,patch,(status,result,error)->{
            if (status==200) {
                message("Solicitud actualizada.");
                fetchBookings(true);
            } else {
                message(error.isEmpty()?"No fue posible guardar el cambio.":error);
                fetchBookings(false);
            }
        });
    }


    private EditText formInput(LinearLayout parent, String hint, int type) {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setHint(hint);
        input.setInputType(type);
        input.setTextSize(15);
        input.setPadding(dp(13), dp(8), dp(13), dp(8));
        input.setBackground(bg(LIGHT, 12, Color.rgb(212, 230, 226)));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(53));
        p.bottomMargin = dp(11);
        parent.addView(input, p);
        return input;
    }

    private LinearLayout formContainer() {
        LinearLayout layout = column();
        layout.setPadding(dp(20), dp(12), dp(20), dp(7));
        return layout;
    }

    private void accountLogin() {
        LinearLayout form = formContainer();
        EditText email = formInput(form, "Correo electrónico", InputType.TYPE_CLASS_TEXT
            | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText password = formInput(form, "Contraseña", InputType.TYPE_CLASS_TEXT
            | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        new AlertDialog.Builder(this)
            .setTitle("Ingreso de conductores y administradores")
            .setView(form)
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Ingresar", (dialog, which) -> {
                JSONObject p = new JSONObject();
                try {
                    p.put("email", email.getText().toString().trim());
                    p.put("password", password.getText().toString());
                } catch (Exception ignored) {}
                password.setText("");
                signInPending();
                api("POST", "/api/staff/login", p, (status, result, error) -> {
                    if (status == 200) {
                        try {
                            JSONObject data = new JSONObject(result);
                            JSONObject user = data.getJSONObject("user");
                            staffToken = data.getString("token");
                            operatorKey = null;
                            staffRole = user.getString("role");
                            staffName = user.optString("name", "");
                            tab = "solicitudes";
                            adminLoaded = false;
                            fetchBookings(true);
                        } catch (Exception e) {
                            loginScreen();
                            message("Respuesta de acceso incorrecta.");
                        }
                    } else {
                        loginScreen();
                        new AlertDialog.Builder(this)
                            .setTitle("No se pudo ingresar")
                            .setMessage(error.isEmpty() ? "Revisá tus datos de acceso." : error)
                            .setPositiveButton("Entendido", null).show();
                    }
                });
            }).show();
    }

    private void driverRegister() {
        LinearLayout form = formContainer();
        EditText name = formInput(form, "Nombre y apellido", InputType.TYPE_CLASS_TEXT
            | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        EditText email = formInput(form, "Correo electrónico", InputType.TYPE_CLASS_TEXT
            | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText password = formInput(form, "Contraseña propia, mínimo 12 caracteres",
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        new AlertDialog.Builder(this).setTitle("Solicitar cuenta de conductor")
            .setMessage("El administrador deberá aprobar la solicitud antes de que puedas operar.")
            .setView(form)
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Registrarme", (dialog, which) -> {
                JSONObject p = new JSONObject();
                try {
                    p.put("name", name.getText().toString().trim());
                    p.put("email", email.getText().toString().trim());
                    p.put("password", password.getText().toString());
                } catch (Exception ignored) {}
                password.setText("");
                api("POST", "/api/staff/register", p, (status, result, error) -> {
                    if (status == 201) new AlertDialog.Builder(this)
                        .setTitle("Registro enviado")
                        .setMessage("Tu cuenta está pendiente de aprobación. No podrás iniciar sesión hasta que el administrador te habilite.")
                        .setPositiveButton("Entendido", null).show();
                    else new AlertDialog.Builder(this)
                        .setTitle("No se pudo registrar")
                        .setMessage(error.isEmpty() ? "Revisá los datos e intentá nuevamente." : error)
                        .setPositiveButton("Entendido", null).show();
                });
            }).show();
    }

    private void bootstrapAdmin() {
        if (operatorKey == null) {
            message("Para el primer administrador se requiere la clave maestra.");
            return;
        }
        LinearLayout form = formContainer();
        EditText name = formInput(form, "Nombre y apellido del administrador",
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        EditText email = formInput(form, "Correo del administrador",
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText password = formInput(form, "Contraseña nueva, mínimo 12 caracteres",
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        new AlertDialog.Builder(this).setTitle("Crear administrador principal")
            .setMessage("Solo puede crearse una vez mediante la clave maestra. El rol administrativo no puede asignarse desde un registro público.")
            .setView(form)
            .setNegativeButton("Cancelar",null)
            .setPositiveButton("Crear administrador",(d,w)->{
                JSONObject p = new JSONObject();
                try {
                    p.put("name",name.getText().toString().trim());
                    p.put("email",email.getText().toString().trim());
                    p.put("password",password.getText().toString());
                }catch(Exception ignored){}
                password.setText("");
                api("POST","/api/admin/bootstrap",p,(status,result,error)->{
                    new AlertDialog.Builder(this)
                        .setTitle(status==201?"Administrador creado":"No se pudo crear")
                        .setMessage(status==201?
                            "Cuenta creada. Podés entrar con tu correo y contraseña desde la pantalla inicial.":error)
                        .setPositiveButton("Entendido",null).show();
                });
            }).show();
    }

    private void loadAdmin() {
        api("GET", "/api/admin/drivers", null, (status, result, error) -> {
            if (status != 200) { message(error.isEmpty()?"No se pudieron consultar conductores":error); return; }
            try { managedDrivers = new JSONObject(result).getJSONArray("drivers"); }
            catch (Exception e) { message("Lista de conductores inválida"); return; }
            api("GET", "/api/admin/settings", null, (code, data, err) -> {
                if (code != 200) { message(err.isEmpty()?"No se pudo consultar configuración":err); return; }
                try {
                    siteEnabled = new JSONObject(data).getBoolean("publicEnabled");
                    adminLoaded = true;
                    if ("administrar".equals(tab)) dashboard();
                } catch (Exception e) { message("Configuración inválida"); }
            });
        });
    }

    private void manage(LinearLayout content) {
        if (!"admin".equals(staffRole)) { addLine(content,"Acceso restringido",18,ORANGE,true,0); return; }
        addLine(content, "Administración", 27, INK, true, 4);
        addLine(content, "Control general de Vía Traslados", 14, MUTED, false, 19);
        if (!adminLoaded) {
            addLine(content, "Consultando la base de datos…", 15, MUTED, false, 12);
            loadAdmin();
            return;
        }
        LinearLayout service = card();
        addLine(service, "Servicio público", 19, INK, true, 10);
        addLine(service, siteEnabled ? "WEB HABILITADA" : "WEB SUSPENDIDA",
            18, siteEnabled ? TEAL : ORANGE, true, 9);
        addLine(service, siteEnabled ?
            "Los pasajeros pueden ingresar y solicitar reservas." :
            "Los pasajeros no pueden crear reservas. La administración continúa disponible.",
            13, MUTED, false, 16);
        service.addView(button(siteEnabled ? "Suspender web de pasajeros" : "Reactivar web de pasajeros",
            !siteEnabled, v -> confirmServiceSwitch()),
            new LinearLayout.LayoutParams(-1, dp(53)));
        appendCard(content, service, 16);

        LinearLayout h = row();
        TextView t = text("Conductores ("+managedDrivers.length()+")",20,INK,true);
        h.addView(t,new LinearLayout.LayoutParams(0,-2,1));
        Button refresh=button("↻",false,v->loadAdmin());
        h.addView(refresh,new LinearLayout.LayoutParams(dp(52),dp(45)));
        content.addView(h);
        spacer(content,12);
        if (managedDrivers.length()==0) {
            LinearLayout empty=card();
            addLine(empty,"Todavía no hay conductores registrados.",14,MUTED,false,0);
            appendCard(content,empty,14);
        }
        for (int i=0;i<managedDrivers.length();i++) {
            JSONObject driver=managedDrivers.optJSONObject(i);
            if (driver==null) continue;
            String id=driver.optString("id");
            String status=driver.optString("status");
            LinearLayout c=card();
            addLine(c,driver.optString("name","Sin nombre"),18,INK,true,5);
            addLine(c,driver.optString("email",""),13,MUTED,false,8);
            String caption="pending".equals(status)?"PENDIENTE":
                "approved".equals(status)?"APROBADO":"BLOQUEADO";
            addLine(c,caption,13,"approved".equals(status)?TEAL:ORANGE,true,14);
            String target="approved".equals(status)?"blocked":"approved";
            String action="approved".equals(status)?"Bloquear conductor":"Aprobar / reactivar conductor";
            c.addView(button(action,!"approved".equals(status),
                v -> confirmDriverStatus(id,driver.optString("name"),target)),
                new LinearLayout.LayoutParams(-1,dp(50)));
            appendCard(content,c,12);
        }
        addLine(content,"Las cuentas bloqueadas quedan sin acceso de inmediato, incluso si habían iniciado sesión.",
            12,MUTED,false,12);
    }

    private void confirmServiceSwitch() {
        boolean target=!siteEnabled;
        if (!target) {
            LinearLayout form=formContainer();
            EditText verification=formInput(form,"Escribí SUSPENDER para confirmar",
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
            new AlertDialog.Builder(this)
                .setTitle("Suspender la web pública")
                .setMessage("Este cambio impedirá solicitudes nuevas de pasajeros. Los conductores y el administrador conservarán el acceso.")
                .setView(form)
                .setNegativeButton("Volver",null)
                .setPositiveButton("Suspender",(d,w)->{
                    if (!"SUSPENDER".equals(verification.getText().toString().trim().toUpperCase(java.util.Locale.ROOT))) {
                        message("No se cambió nada: faltó la confirmación SUSPENDER.");
                        return;
                    }
                    changeSite(false);
                }).show();
        } else new AlertDialog.Builder(this).setTitle("Reactivar Vía Traslados")
            .setMessage("¿Volvés a habilitar las reservas públicas?")
            .setNegativeButton("Cancelar",null)
            .setPositiveButton("Reactivar",(d,w)->changeSite(true)).show();
    }

    private void changeSite(boolean enabled) {
        try {
            JSONObject patch=new JSONObject().put("publicEnabled",enabled);
            api("PATCH","/api/admin/settings",patch,(status,result,error)->{
                if(status==200) {
                    siteEnabled=enabled;
                    message(enabled?"Web habilitada":"Web suspendida");
                    loadAdmin();
                }else message(error.isEmpty()?"No se pudo cambiar el estado":error);
            });
        }catch(Exception e){message("No se pudo preparar la operación");}
    }

    private void confirmDriverStatus(String id,String name,String target) {
        boolean block="blocked".equals(target);
        new AlertDialog.Builder(this)
            .setTitle(block?"Bloquear conductor":"Habilitar conductor")
            .setMessage(block?"Se revocará inmediatamente el acceso de "+name+".":
                "¿Aprobás o reactivás a "+name+" para operar?")
            .setNegativeButton("Cancelar",null)
            .setPositiveButton("Confirmar",(d,w)->{
                try {
                    JSONObject patch=new JSONObject().put("status",target);
                    api("PATCH","/api/admin/drivers/"+Uri.encode(id),patch,(status,result,error)->{
                        if(status==200){message("Estado actualizado");loadAdmin();}
                        else message(error.isEmpty()?"No se pudo modificar el conductor":error);
                    });
                }catch(Exception e){message("No se pudo preparar la operación");}
            }).show();
    }

    private void driverAssignmentDialog(JSONObject booking) {
        if (!"admin".equals(staffRole)) return;
        api("GET","/api/admin/drivers",null,(status,response,error)->{
            if(status!=200){message(error);return;}
            try {
                JSONArray arr=new JSONObject(response).getJSONArray("drivers");
                java.util.ArrayList<String> names=new java.util.ArrayList<>();
                java.util.ArrayList<String> ids=new java.util.ArrayList<>();
                names.add("Sin conductor asignado");
                ids.add("");
                for(int i=0;i<arr.length();i++){
                    JSONObject d=arr.getJSONObject(i);
                    if("approved".equals(d.optString("status"))){
                        names.add(d.optString("name")+" · "+d.optString("email"));
                        ids.add(d.getString("id"));
                    }
                }
                new AlertDialog.Builder(this).setTitle("Asignar solicitud "+booking.optString("id"))
                    .setItems(names.toArray(new String[0]),(d,which)->{
                        try {
                            JSONObject payload=new JSONObject();
                            if(which==0) payload.put("driverId",JSONObject.NULL);
                            else payload.put("driverId",ids.get(which));
                            api("POST","/api/admin/requests/"+Uri.encode(booking.optString("id"))+"/assign",
                                payload,(code,body,err)->{
                                    if(code==200){message("Asignación guardada");fetchBookings(true);}
                                    else message(err.isEmpty()?"No se pudo asignar":err);
                                });
                        }catch(Exception e){message("Asignación inválida");}
                    }).setNegativeButton("Cancelar",null).show();
            }catch(Exception e){message("No se pudo leer la lista de conductores");}
        });
    }

    private void settings(LinearLayout body) {
        addLine(body, "Configuración", 27, INK, true, 5);
        addLine(body, "Vía Traslados · Conductor", 14, MUTED, false, 20);
        LinearLayout c=card();
        addLine(c,"Cuenta del conductor",19,INK,true,9);
        addLine(c,"Sesión activa en este dispositivo",14,TEAL,true,14);
        addLine(c,"Las credenciales permanecen únicamente en memoria mientras la aplicación está abierta.",
            14,MUTED,false,14);
        c.addView(button("Cerrar sesión",false,v->{
            if (staffToken != null) api("POST", "/api/staff/logout", new JSONObject(), (status,response,error)->{});
            operatorKey=null;
            staffToken=null;
            bookings=new JSONArray();
            lastPayload="";
            loginScreen();
        }),new LinearLayout.LayoutParams(-1,dp(50)));
        appendCard(body,c,14);
        if ("admin".equals(staffRole) && operatorKey!=null) {
            LinearLayout bootstrap=card();
            addLine(bootstrap,"Administrador con usuario personal",18,INK,true,7);
            addLine(bootstrap,"Creá tu cuenta administrativa una sola vez, usando la clave maestra actual.",13,MUTED,false,12);
            bootstrap.addView(button("Crear mi usuario administrador",true,v->bootstrapAdmin()),new LinearLayout.LayoutParams(-1,dp(51)));
            appendCard(body,bootstrap,13);
        }
        LinearLayout info=card();
        addLine(info,"Información",19,INK,true,10);
        addLine(info,"Versión 0.1.0 · Pruebas QA",14,INK,false,5);
        addLine(info,"Servidor: via-traslados-api",13,MUTED,false,6);
        addLine(info,"Moneda: pesos uruguayos (UYU)",13,MUTED,false,6);
        addLine(info,"Actualización: cada 30 segundos con la app abierta",13,MUTED,false,10);
        addLine(info,"Mensajería en la app, notificaciones push y cálculo de precios automáticos: pendientes.",
            13,MUTED,false,5);
        appendCard(body,info,14);
        LinearLayout r=card();
        addLine(r,"Soporte",19,INK,true,9);
        addLine(r,"La aplicación utiliza exclusivamente Vía Traslados. No tiene acceso a Quick Trip ni a sus cuentas.",
            13,MUTED,false,12);
        r.addView(button("Verificar conexión",false,v->fetchBookings(true)),
            new LinearLayout.LayoutParams(-1,dp(50)));
        appendCard(body,r,10);
    }

    private void navigation() {
        LinearLayout bar=row();
        bar.setPadding(dp(9),dp(5),dp(9),dp(5));
        bar.setBackgroundColor(Color.WHITE);
        boolean admin="admin".equals(staffRole);
        String[] titles=admin?new String[]{"Solicitudes","Viajes","Historial","Administrar","Ajustes"}:new String[]{"Solicitudes","Viajes","Historial","Ajustes"};
        String[] icons=admin?new String[]{"≡","▣","◷","⚙","☷"}:new String[]{"≡","▣","◷","⚙"};
        String[] values=admin?new String[]{"solicitudes","viajes","historial","administrar","ajustes"}:new String[]{"solicitudes","viajes","historial","ajustes"};
        for(int i=0;i<titles.length;i++) {
            final String next=values[i];
            LinearLayout slot=column();
            slot.setGravity(Gravity.CENTER);
            TextView icon=text(icons[i],24,next.equals(tab)?TEAL:MUTED,false);
            icon.setGravity(Gravity.CENTER);
            slot.addView(icon);
            TextView name=text(titles[i],11,next.equals(tab)?TEAL:MUTED,next.equals(tab));
            name.setGravity(Gravity.CENTER);
            slot.addView(name);
            slot.setOnClickListener(v->{tab=next;dashboard();});
            bar.addView(slot,new LinearLayout.LayoutParams(0,dp(62),1));
        }
        root.addView(bar,new LinearLayout.LayoutParams(-1,dp(72)));
    }

    private void message(String s) { Toast.makeText(this,s,Toast.LENGTH_LONG).show(); }
}
