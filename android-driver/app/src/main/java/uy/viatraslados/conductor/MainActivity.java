package uy.viatraslados.conductor;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.view.Window;
import android.view.WindowManager;
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
    private static final int TEAL = Color.rgb(3, 116, 109);
    private static final int TEAL_DARK = Color.rgb(0, 96, 91);
    private static final int BORDER = Color.rgb(223, 234, 230);
    private static final int SOFT = Color.rgb(234, 246, 242);
    private static final int INK = Color.rgb(24, 44, 48);
    private static final int MUTED = Color.rgb(105, 123, 125);
    private static final int LIGHT = Color.rgb(247, 250, 248);
    private static final int ORANGE = Color.rgb(211, 110, 43);
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private LinearLayout root;
    private String operatorKey;
    private String staffToken;
    private String staffRefreshToken;
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
    private String requestOrder = "trip";
    private String requestFilter = "all";
    private String requestSearch = "";
    private boolean requestSearchVisible = false;
    private boolean loading = false;
    private boolean visible = false;
    private Dialog acceptanceDialog;
    private String acceptanceDialogId = "";
    private final Runnable poll = new Runnable() {
        @Override public void run() {
            if (visible && (operatorKey != null || staffToken != null)) fetchBookings(false);
            if (visible) handler.postDelayed(this, 20000);
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
        if (BuildConfig.VIA_PREVIEW) {
            // APK independiente, solo datos ficticios; no accede al Worker ni a D1.
            staffRole = "admin";
            staffName = "Administrador de demostración";
            operatorKey = "PREVIEW_LOCAL_NO_NETWORK";
            if(BuildConfig.VIA_BUSINESS_PREVIEW){
                staffToken = "PREVIEW_LOCAL_TOKEN_NO_NETWORK";
                canManageRoles = true;
            }
            adminLoaded = true;
            managedDrivers = ViaPreviewData.drivers();
            bookings = ViaPreviewData.requests();
            tab = "solicitudes";
            dashboard();
        } else {
            loginScreen();
        }
    }

    @Override protected void onResume() {
        super.onResume();
        visible = true;
        handler.removeCallbacks(poll);
        handler.postDelayed(poll, 20000);
        if (operatorKey != null || staffToken != null) fetchBookings(false);
    }

    @Override protected void onPause() {
        visible = false;
        handler.removeCallbacks(poll);
        if (acceptanceDialog != null) acceptanceDialog.dismiss();
        super.onPause();
    }

    @Override protected void onDestroy() {
        operatorKey = null;
        staffToken = null;
        staffRefreshToken = null;
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

    private android.graphics.drawable.Drawable ripple(int color, int border, int radius) {
        return new android.graphics.drawable.RippleDrawable(
            android.content.res.ColorStateList.valueOf(Color.argb(31, 0, 102, 95)),
            bg(color, radius, border), null);
    }

    private Button button(String label, boolean primary, View.OnClickListener click) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(14);
        b.setLetterSpacing(0);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setTextColor(primary ? Color.WHITE : TEAL_DARK);
        b.setBackground(ripple(primary ? TEAL : Color.WHITE, primary ? 0 : BORDER, 13));
        b.setElevation(0);
        b.setStateListAnimator(null);
        b.setPadding(dp(14), dp(6), dp(14), dp(6));
        b.setMinHeight(dp(48));
        b.setMinWidth(0);
        b.setOnClickListener(click);
        return b;
    }

    private LinearLayout card() {
        LinearLayout c = column();
        c.setPadding(dp(16), dp(16), dp(16), dp(16));
        c.setBackground(bg(Color.WHITE, 16, BORDER));
        c.setElevation(0);
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

    private TextView actionText(String label, int color, View.OnClickListener action) {
        TextView v = text(label, 13, color, true);
        v.setGravity(Gravity.CENTER);
        v.setMinHeight(dp(46));
        v.setPadding(dp(9), dp(9), dp(9), dp(9));
        v.setBackground(ripple(Color.TRANSPARENT, 0, 10));
        v.setOnClickListener(action);
        v.setClickable(true);
        v.setFocusable(true);
        return v;
    }

    private LinearLayout inputShell(String icon, EditText input, boolean isPassword) {
        LinearLayout shell = row();
        shell.setPadding(dp(13), 0, dp(12), 0);
        shell.setBackground(bg(Color.WHITE, 12, BORDER));
        TextView leading = text(icon, 19, MUTED, false);
        leading.setGravity(Gravity.CENTER);
        shell.addView(leading, new LinearLayout.LayoutParams(dp(24), dp(48)));
        LinearLayout.LayoutParams inputLayout = new LinearLayout.LayoutParams(0, dp(52), 1);
        inputLayout.leftMargin = dp(10);
        input.setBackgroundColor(Color.TRANSPARENT);
        input.setTextSize(16);
        input.setSingleLine(true);
        input.setTextColor(INK);
        input.setHintTextColor(Color.rgb(153, 168, 165));
        input.setPadding(0, dp(6), 0, dp(6));
        shell.addView(input, inputLayout);
        if (isPassword) {
            TextView eye = actionText("Mostrar", TEAL_DARK, v -> {
                int cursor = input.getSelectionStart();
                boolean hidden = (input.getInputType() & InputType.TYPE_TEXT_VARIATION_PASSWORD) != 0;
                input.setInputType(InputType.TYPE_CLASS_TEXT | (hidden ?
                    InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD :
                    InputType.TYPE_TEXT_VARIATION_PASSWORD));
                input.setTypeface(Typeface.DEFAULT);
                input.setSelection(Math.min(Math.max(cursor,0), input.length()));
                ((TextView) v).setText(hidden ? "Ocultar" : "Mostrar");
            });
            eye.setTextSize(12);
            shell.addView(eye, new LinearLayout.LayoutParams(-2, dp(48)));
        }
        return shell;
    }

    private boolean authFlow = false;
    private JSONArray managedAdmins = new JSONArray();
    private boolean canManageRoles = false; // Privilegio decidido por el servidor, nunca por el teléfono en la APK.
    private String staffUserId = "";

    @Override public void onBackPressed() {
        if (authFlow) { loginScreen(); return; }
        super.onBackPressed();
    }

    private LinearLayout authPage(String eyebrow, String heading, String subtitle) {
        authFlow = true;
        root.removeAllViews();
        root.setBackgroundColor(LIGHT);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, -1));

        LinearLayout page = column();
        page.setPadding(dp(25), dp(16), dp(25), dp(28));
        scroll.addView(page);
        LinearLayout top = row();
        TextView back = actionText("‹  Volver", TEAL_DARK, v -> loginScreen());
        back.setTextSize(14);
        top.addView(back, new LinearLayout.LayoutParams(0, dp(44), 1));
        TextView signature = text("VÍA  /  TRASLADOS", 11, MUTED, true);
        signature.setLetterSpacing(0.10f);
        top.addView(signature);
        page.addView(top);
        spacer(page, 27);

        TextView label = text(eyebrow, 11, TEAL_DARK, true);
        label.setLetterSpacing(0.15f);
        page.addView(label);
        spacer(page, 10);
        addLine(page, heading, 29, INK, true, 9);
        addLine(page, subtitle, 14, MUTED, false, 23);
        return page;
    }

    private EditText authField(LinearLayout page, String label, String hint, int inputType, boolean secret) {
        TextView caption = text(label, 11, MUTED, true);
        caption.setLetterSpacing(0.10f);
        page.addView(caption);
        spacer(page, 7);
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setInputType(inputType);
        input.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_NEXT);
        page.addView(inputShell(secret ? "◈" : "·", input, secret),
            new LinearLayout.LayoutParams(-1, dp(52)));
        spacer(page, 15);
        return input;
    }

    private LinearLayout authWaiting(LinearLayout page) {
        LinearLayout wait = column();
        wait.setVisibility(View.GONE);
        TextView status = text("", 13, MUTED, false);
        wait.addView(status);
        spacer(wait, 8);
        android.widget.ProgressBar bar = new android.widget.ProgressBar(this, null,
            android.R.attr.progressBarStyleHorizontal);
        bar.setIndeterminate(true);
        bar.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(TEAL));
        wait.addView(bar, new LinearLayout.LayoutParams(-1, dp(3)));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
        p.topMargin = dp(15);
        page.addView(wait, p);
        return wait;
    }

    private void authBusy(LinearLayout wait, Button button, boolean busy, String description) {
        ((TextView) wait.getChildAt(0)).setText(description);
        wait.setVisibility(busy ? View.VISIBLE : View.GONE);
        button.setEnabled(!busy);
        button.setAlpha(busy ? 0.68f : 1f);
    }

    private TextView authError(LinearLayout page) {
        TextView error = text("", 13, ORANGE, false);
        error.setVisibility(View.GONE);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.topMargin = dp(12);
        page.addView(error, lp);
        return error;
    }

    private void authErrorText(TextView view, String message) {
        view.setText(message);
        view.setVisibility(message == null || message.isEmpty() ? View.GONE : View.VISIBLE);
    }

    private void accountResult(boolean ready, String role) {
        LinearLayout page = authPage("CUENTA VERIFICADA",
            ready ? "Todo pronto." : "Correo confirmado.",
            ready ? "Tu cuenta está lista para comenzar." :
                    "Tu cuenta quedó registrada. Te avisaremos cuando el administrador la habilite.");
        spacer(page, 9);
        LinearLayout status = card();
        addLine(status, ready ? "✓ Acceso habilitado" : "◷ Esperando aprobación",
            17, ready ? TEAL_DARK : INK, true, 8);
        addLine(status, ready ?
            "Ya podés ingresar con tu celular y contraseña." :
            "La verificación del correo está completa. Falta autorizar tu cuenta.",
            13, MUTED, false, 0);
        appendCard(page, status, 21);
        Button enter = button("Ir a ingresar  →", true, v -> loginScreen());
        page.addView(enter, new LinearLayout.LayoutParams(-1, dp(52)));
    }

    private void loginPhone(String phone, String password) {
        if (phone.trim().isEmpty() || password.isEmpty()) {
            message("Ingresá tu celular y contraseña.");
            return;
        }
        JSONObject data = new JSONObject();
        try {
            data.put("phone", phone.trim());
            data.put("password", password);
        } catch (Exception ignored) {}
        signInPending();
        api("POST", "/api/staff/login-phone", data, (status, response, error) -> {
            if (status == 200) {
                try {
                    JSONObject parsed = new JSONObject(response);
                    JSONObject user = parsed.getJSONObject("user");
                    operatorKey = null;
                    staffToken = parsed.getString("token");
                    staffRefreshToken = parsed.getString("refreshToken");
                    staffRole = user.getString("role");
                    staffUserId = user.optString("id", "");
                    JSONObject capabilities = user.optJSONObject("capabilities");
                    canManageRoles = "admin".equals(staffRole) && capabilities != null &&
                        capabilities.optBoolean("manageTeam", false);
                    staffName = user.optString("name", "");
                    getSharedPreferences("via_preferences", MODE_PRIVATE)
                        .edit().putString("last_phone", phone.trim()).apply();
                    tab = "admin".equals(staffRole) ? "administrar" : "viajes";
                    adminLoaded = false;
                    fetchBookings(true);
                    offerBiometric();
                } catch (Exception e) {
                    loginScreen();
                    message("No se pudo completar el ingreso.");
                }
            } else {
                loginScreen();
                new AlertDialog.Builder(this)
                    .setTitle("No pudimos ingresar")
                    .setMessage(error == null || error.isEmpty() ?
                        "Verificá tu número y contraseña." : error)
                    .setPositiveButton("Entendido", null).show();
            }
        });
    }

    private void adminMasterDialog() {
        LinearLayout form = formContainer();
        addLine(form, "Esta clave es solo para crear o recuperar tu cuenta de administrador. El acceso habitual se hace con celular y contraseña.",
            14, MUTED, false, 12);
        EditText key = formInput(form, "Clave maestra de administrador",
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        new AlertDialog.Builder(this)
            .setTitle("Acceso de administración")
            .setView(form)
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Continuar", (dialog, which) -> {
                String entered = key.getText().toString();
                key.setText("");
                if (entered.isEmpty()) {
                    message("Ingresá la clave maestra.");
                    return;
                }
                operatorKey = entered;
                staffToken = null;
                staffRefreshToken = null;
                staffRole = "admin";
                staffName = "Administrador principal";
                tab = "administrar";
                adminLoaded = false;
                signInPending();
                fetchBookings(true);
            }).show();
    }

    private void loginScreen() {
        authFlow = false;
        root.removeAllViews();
        operatorKey = null;
        staffToken = null;
        staffRefreshToken = null;
        staffRole = "driver";
        staffName = "";
        staffUserId = "";
        routeResults.clear();
        routeStarted.clear();
        routeFailures.clear();
        routeCards.clear();
        routeCardBookings.clear();
        routeProviderMissing=false;
        routeLastFailureAt=0;
        canManageRoles = false;
        managedAdmins = new JSONArray();
        root.setBackgroundColor(LIGHT);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout page = column();
        page.setPadding(dp(24), dp(27), dp(24), dp(16));
        scroll.addView(page);

        LinearLayout brand = row();
        TextView mark = text("V", 25, Color.WHITE, true);
        mark.setGravity(Gravity.CENTER);
        mark.setBackground(bg(TEAL, 14, 0));
        brand.addView(mark, new LinearLayout.LayoutParams(dp(48), dp(48)));
        LinearLayout titles = column();
        LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(0, -2, 1);
        tl.leftMargin = dp(12);
        brand.addView(titles, tl);
        addLine(titles, "Vía Traslados", 21, INK, true, 2);
        addLine(titles, "Centro de operaciones", 12, MUTED, false, 0);
        page.addView(brand);
        spacer(page, 43);

        addLine(page, "Bienvenido", 30, INK, true, 7);
        addLine(page, "Ingresá para gestionar tus traslados.", 14, MUTED, false, 26);

        TextView phoneLabel = text("CELULAR", 11, MUTED, true);
        phoneLabel.setLetterSpacing(0.12f);
        page.addView(phoneLabel);
        spacer(page, 8);
        EditText phone = new EditText(this);
        phone.setInputType(InputType.TYPE_CLASS_PHONE);
        phone.setHint("099 123 456");
        phone.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_NEXT);
        phone.setText(getSharedPreferences("via_preferences", MODE_PRIVATE).getString("last_phone", ""));
        page.addView(inputShell("☎", phone, false), new LinearLayout.LayoutParams(-1, dp(54)));
        spacer(page, 17);

        TextView passLabel = text("CONTRASEÑA", 11, MUTED, true);
        passLabel.setLetterSpacing(0.12f);
        page.addView(passLabel);
        spacer(page, 8);
        EditText password = new EditText(this);
        password.setHint("Tu contraseña");
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        password.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_DONE);
        page.addView(inputShell("◈", password, true), new LinearLayout.LayoutParams(-1, dp(54)));
        password.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_DONE) {
                loginPhone(phone.getText().toString(), password.getText().toString());
                return true;
            }
            return false;
        });
        spacer(page, 16);

        TextView forgot = actionText("¿Olvidaste tu contraseña?", TEAL_DARK,
            v -> passwordResetStart(phone.getText().toString()));
        forgot.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        page.addView(forgot);
        spacer(page, 7);

        Button enter = button("Ingresar   →", true, v ->
            loginPhone(phone.getText().toString(), password.getText().toString()));
        enter.setTextSize(16);
        page.addView(enter, new LinearLayout.LayoutParams(-1, dp(54)));

        if (BiometricVault.hasSaved(this) && BiometricVault.supported(this)) {
            spacer(page, 10);
            Button fingerprint = button("◎  Ingresar con huella", false, v -> biometricLogin());
            fingerprint.setTextSize(14);
            fingerprint.setContentDescription("Ingresar usando la huella del teléfono");
            page.addView(fingerprint, new LinearLayout.LayoutParams(-1, dp(52)));
        }

        spacer(page, 27);
        View line = new View(this);
        line.setBackgroundColor(BORDER);
        page.addView(line, new LinearLayout.LayoutParams(-1, dp(1)));
        spacer(page, 14);

        LinearLayout signup = row();
        TextView question = text("¿Sos nuevo?", 13, MUTED, false);
        signup.addView(question);
        TextView register = actionText("Solicitar registro  →", TEAL_DARK, v -> driverRegister());
        signup.addView(register);
        page.addView(signup);
        spacer(page, 5);

        LinearLayout extras = row();
        TextView verify = actionText("Verificar correo", MUTED, v -> askEmailForVerification());
        extras.addView(verify);
        View tiny = new View(this);
        tiny.setBackgroundColor(BORDER);
        LinearLayout.LayoutParams sep = new LinearLayout.LayoutParams(dp(1), dp(16));
        sep.leftMargin = dp(5);
        sep.rightMargin = dp(5);
        extras.addView(tiny, sep);
        TextView admin = actionText("Ayuda para ingresar", MUTED, v ->
            new AlertDialog.Builder(this)
                .setTitle("Acceso a Vía Traslados")
                .setMessage("Si sos el titular fundador, ingresá con tu celular y contraseña. Tu rol de administrador se reconocerá automáticamente cuando esté habilitado en el servidor. La clave maestra anterior solo se usa para recuperación excepcional.")
                .setNegativeButton("Cerrar", null)
                .setPositiveButton("Recuperación avanzada", (d,w) -> adminMasterDialog())
                .show());
        extras.addView(admin);
        page.addView(extras);
        spacer(page, 14);

        TextView foot = text("ACCESO SEGURO  ·  VÍA TRASLADOS", 10, MUTED, true);
        foot.setGravity(Gravity.CENTER);
        foot.setLetterSpacing(0.10f);
        page.addView(foot);
    }

    private void signInPending() {
        root.removeAllViews();
        LinearLayout c = column();
        c.setGravity(Gravity.CENTER);
        root.addView(c, new LinearLayout.LayoutParams(-1, -1));
        android.widget.ProgressBar spinner = new android.widget.ProgressBar(this);
        spinner.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(TEAL));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(38),dp(38));
        lp.gravity=Gravity.CENTER_HORIZONTAL;
        c.addView(spinner,lp);
        spacer(c,20);
        TextView t = text("Preparando tu espacio…", 15, INK, true);
        t.setGravity(Gravity.CENTER);
        c.addView(t);
    }

    private interface Done { void call(int status, String body, String error); }
    private void api(String method, String path, JSONObject payload, Done done) {
        if (BuildConfig.VIA_PREVIEW) {
            handler.post(() -> {
                if (isFinishing()) return;
                ViaPreviewData.Reply reply = ViaPreviewData.request(method,path,payload);
                String error = "";
                if (reply.status >= 400) {
                    try { error = new JSONObject(reply.body).optString("error","Sin conexión en demo"); }
                    catch(Exception ignored) { error = "Modo demostración"; }
                }
                done.call(reply.status,reply.body,error);
            });
            return;
        }
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
                    for(int i=0;i<next.length();i++){
                        JSONObject item=next.optJSONObject(i);
                        if(item==null)continue;
                        String routeId=item.optString("id","");
                        JSONObject saved=item.optJSONObject("route");
                        if(!routeId.isEmpty()&&saved!=null&&
                            saved.optDouble("distanceKm",0)>0&&saved.optInt("durationMinutes",0)>0){
                            routeResults.put(routeId,saved);
                            routeFailures.remove(routeId);
                            routeProviderMissing=false;
                        }
                    }
                    bookings = next;
                    if (login || !result.equals(lastPayload)) {
                        lastPayload = result;
                        dashboard();
                    } else {
                        requestVisibleRoutes();
                    }
                    notifyAcceptedProposals(next);
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

    // Aviso visible solamente mientras la APK está abierta. No es push FCM.
    // Conserva solo el identificador de la aceptación ya anunciada, nunca las credenciales.
    private void notifyAcceptedProposals(JSONArray rows) {
        if (BuildConfig.VIA_PREVIEW) return;
        if (!visible || rows==null || (operatorKey==null && staffToken==null)) return;
        if (acceptanceDialog!=null) {
            boolean stillPending=false;
            for (int i=0;i<rows.length();i++) {
                JSONObject r=rows.optJSONObject(i);
                if (r!=null && acceptanceDialogId.equals(r.optString("id")) &&
                    "accepted".equals(r.optString("status"))) { stillPending=true;break; }
            }
            if (!stillPending) acceptanceDialog.dismiss();
        }
        if (acceptanceDialog!=null) return;
        android.content.SharedPreferences prefs=getSharedPreferences("via_acceptance_alerts_v25",MODE_PRIVATE);
        for (int i=0;i<rows.length();i++) {
            JSONObject r=rows.optJSONObject(i);
            if (r==null||!"accepted".equals(r.optString("status")))continue;
            String id=r.optString("id","");
            if (id.isEmpty()||prefs.getBoolean("seen_"+id,false))continue;
            prefs.edit().putBoolean("seen_"+id,true).apply();
            showAcceptedBottomSheet(r);
            break;
        }
    }

    private void showAcceptedBottomSheet(JSONObject booking) {
        if (!visible||isFinishing())return;
        Dialog dialog=new Dialog(this);
        LinearLayout outer=column();
        outer.setPadding(dp(12),0,dp(12),dp(10));
        LinearLayout sheet=column();
        sheet.setPadding(dp(16),dp(10),dp(16),dp(15));
        sheet.setBackground(bg(Color.WHITE,20,BORDER));
        outer.addView(sheet,new LinearLayout.LayoutParams(-1,-2));
        LinearLayout handleRow=row();
        handleRow.setGravity(Gravity.CENTER);
        View handle=new View(this);
        handle.setBackground(bg(Color.rgb(226,235,230),5,0));
        handleRow.addView(handle,new LinearLayout.LayoutParams(dp(38),dp(4)));
        sheet.addView(handleRow,new LinearLayout.LayoutParams(-1,dp(10)));
        spacer(sheet,9);
        LinearLayout header=row();
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView icon=text("✓",22,TEAL,true);
        icon.setGravity(Gravity.CENTER);
        icon.setBackground(bg(Color.rgb(226,247,237),12,0));
        header.addView(icon,new LinearLayout.LayoutParams(dp(40),dp(40)));
        LinearLayout heading=column();
        LinearLayout.LayoutParams headingParams=new LinearLayout.LayoutParams(0,-2,1);
        headingParams.leftMargin=dp(11);
        header.addView(heading,headingParams);
        addLine(heading,"¡Presupuesto aceptado!",16,INK,true,3);
        addLine(heading,"El pasajero aceptó tu propuesta.",11,MUTED,false,0);
        TextView close=actionText("×",MUTED,v->dialog.dismiss());
        close.setTextSize(24);
        close.setGravity(Gravity.CENTER);
        close.setContentDescription("Cerrar aviso");
        header.addView(close,new LinearLayout.LayoutParams(dp(32),dp(32)));
        sheet.addView(header);
        spacer(sheet,12);
        LinearLayout trip=row();
        trip.setGravity(Gravity.CENTER_VERTICAL);
        trip.setPadding(dp(11),dp(10),dp(11),dp(10));
        trip.setBackground(bg(Color.rgb(241,249,245),11,Color.rgb(223,239,229)));
        String origin=prettyAddress(booking.optString("origin",""));
        String destination=prettyAddress(booking.optString("destination",""));
        if(origin.contains(","))origin=origin.split(",")[0];
        if(destination.contains(","))destination=destination.split(",")[0];
        TextView journey=text(origin+"  →  "+destination,12,INK,true);
        journey.setMaxLines(2);
        journey.setEllipsize(android.text.TextUtils.TruncateAt.END);
        trip.addView(journey,new LinearLayout.LayoutParams(0,-2,1));
        int price=booking.optInt("price",0);
        if(price>0){
            TextView amount=text(String.format(new java.util.Locale("es","UY"),"$ %,d",price)+" UYU",
                14,TEAL_DARK,true);
            LinearLayout.LayoutParams amountParams=new LinearLayout.LayoutParams(-2,-2);
            amountParams.leftMargin=dp(7);
            trip.addView(amount,amountParams);
        }
        sheet.addView(trip);
        spacer(sheet,9);
        addLine(sheet,"Falta tu confirmación definitiva para asegurar el viaje.",
            11,MUTED,false,10);
        LinearLayout actions=row();
        Button show=button("Ver reserva",true,v->{
            dialog.dismiss();tab="viajes";dashboard();details(booking);
        });
        show.setMinHeight(0);
        actions.addView(show,new LinearLayout.LayoutParams(0,dp(43),1));
        Button confirm=button("Ir a confirmar",false,v->{
            dialog.dismiss();tab="viajes";dashboard();
            // Abre la confirmación con pregunta explícita; jamás cambia el estado automáticamente.
            confirmStatus(booking,"confirmed","Confirmar servicio");
        });
        confirm.setMinHeight(0);
        LinearLayout.LayoutParams confirmParams=new LinearLayout.LayoutParams(0,dp(43),1);
        confirmParams.leftMargin=dp(7);
        actions.addView(confirm,confirmParams);
        sheet.addView(actions,new LinearLayout.LayoutParams(-1,dp(43)));

        acceptanceDialog=dialog;
        acceptanceDialogId=booking.optString("id","");
        dialog.setOnDismissListener(ignored->{acceptanceDialog=null;acceptanceDialogId="";});
        dialog.setContentView(outer);
        dialog.show();
        Window window=dialog.getWindow();
        if(window!=null){
            window.setBackgroundDrawableResource(android.R.color.transparent);
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams params=window.getAttributes();
            params.width=WindowManager.LayoutParams.MATCH_PARENT;
            params.height=WindowManager.LayoutParams.WRAP_CONTENT;
            params.gravity=Gravity.BOTTOM;
            params.dimAmount=.18f;
            window.setAttributes(params);
        }
    }

    private LinearLayout statTile(String value, String label, boolean featured) {
        LinearLayout tile = column();
        tile.setPadding(dp(15),dp(13),dp(15),dp(13));
        tile.setBackground(bg(featured ? SOFT : Color.WHITE, 14, featured ? 0 : BORDER));
        addLine(tile, value, 24, featured ? TEAL_DARK : INK, true, 3);
        addLine(tile, label, 12, MUTED, false, 0);
        return tile;
    }

    private void dashboard() {
        if (operatorKey == null && staffToken == null) return;
        authFlow = false;
        routeLabels.clear();
        routeSpinners.clear();
        routeCredits.clear();
        routeCards.clear();
        routeCardBookings.clear();
        root.removeAllViews();
        root.setBackgroundColor(LIGHT);

        LinearLayout header = row();
        header.setPadding(dp(17), dp(9), dp(17), dp(9));
        header.setBackgroundColor(Color.WHITE);

        TextView emblem = text("V", 21, Color.WHITE, true);
        emblem.setGravity(Gravity.CENTER);
        emblem.setBackground(bg(TEAL, 11, 0));
        header.addView(emblem, new LinearLayout.LayoutParams(dp(36), dp(36)));

        LinearLayout brand = column();
        LinearLayout.LayoutParams bl = new LinearLayout.LayoutParams(0, -2, 1);
        bl.leftMargin = dp(11);
        header.addView(brand, bl);
        addLine(brand, "Vía Traslados", 18, INK, true, 3);
        addLine(brand, "admin".equals(staffRole) ? "Centro de operaciones" : "Mi espacio de conductor",
            12, MUTED, false, 0);

        TextView refresh = actionText("↻", TEAL_DARK, v -> {
            routeProviderMissing=false;
            routeFailures.clear();
            routeLastFailureAt=0;
            fetchBookings(true);
        });
        refresh.setTextSize(21);
        refresh.setBackground(ripple(SOFT,0,12));
        refresh.setContentDescription("Actualizar solicitudes");
        header.addView(refresh, new LinearLayout.LayoutParams(dp(38), dp(38)));
        int acceptedCount=count("accepted");
        if (acceptedCount>0) {
            TextView badge=text(acceptedCount+" aceptada"+(acceptedCount==1?"":"s"),10,TEAL_DARK,true);
            badge.setGravity(Gravity.CENTER);
            badge.setPadding(dp(8),dp(5),dp(8),dp(5));
            badge.setBackground(bg(SOFT,10,Color.rgb(187,225,205)));
            badge.setContentDescription(acceptedCount+" presupuestos aceptados sin confirmar. Abrir Mis viajes.");
            badge.setClickable(true);
            badge.setFocusable(true);
            badge.setOnClickListener(v->{tab="viajes";dashboard();});
            LinearLayout.LayoutParams badgeParams=new LinearLayout.LayoutParams(-2,dp(34));
            badgeParams.leftMargin=dp(7);
            header.addView(badge,badgeParams);
        }
        root.addView(header,new LinearLayout.LayoutParams(-1,-2));
        if (BuildConfig.VIA_PREVIEW) {
            TextView demo=text(BuildConfig.VIA_LAYOUT_PREVIEW ?
                "V30 · DETALLE Y COTIZACIÓN · DEMO SIN PRODUCCIÓN" :
                BuildConfig.VIA_BUSINESS_PREVIEW ?
                "V29 · SOCIOS Y TARIFAS · DEMO SIN PRODUCCIÓN" :
                BuildConfig.VIA_DENSE_PREVIEW ?
                "V28 · DEMO PREMIUM COMPACTA · SIN PRODUCCIÓN" :
                "V27 · DEMO SIN CONEXIÓN A PRODUCCIÓN",
                10,TEAL_DARK,true);
            demo.setGravity(Gravity.CENTER);
            demo.setPadding(dp(8),dp(7),dp(8),dp(7));
            demo.setBackgroundColor(SOFT);
            root.addView(demo,new LinearLayout.LayoutParams(-1,-2));
        }

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOnScrollChangeListener((v,x,y,oldX,oldY)->requestVisibleRoutes());
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));

        LinearLayout content = column();
        content.setPadding(dp("solicitudes".equals(tab)?13:17),dp(10),dp("solicitudes".equals(tab)?13:17),dp(12));
        scroll.addView(content);
        if ("administrar".equals(tab)) manage(content);
        else if ("ajustes".equals(tab)) settings(content);
        else if ("historial".equals(tab)) lists(content, "historial");
        else if ("viajes".equals(tab)) lists(content, "viajes");
        else lists(content, "solicitudes");
        navigation();
        // Consultar solo tarjetas visibles: no realizar decenas de llamadas
        // si la lista contiene muchos viajes o se actualiza cada 30 segundos.
        handler.post(()->{if(!isFinishing())requestVisibleRoutes();});
    }

    private int count(String status) {
        int n=0;
        for (int i=0;i<bookings.length();i++)
            if (status.equals(bookings.optJSONObject(i).optString("status"))) n++;
        return n;
    }

    // V27: cabecera densa y utilitaria. Los tres controles tienen comportamiento real.
    private TextView requestControl(String label, View.OnClickListener action) {
        TextView chip=text(label,12,TEAL_DARK,true);
        chip.setGravity(Gravity.CENTER);
        chip.setMinHeight(dp(40));
        chip.setPadding(dp(9),dp(6),dp(9),dp(6));
        chip.setSingleLine(true);
        chip.setEllipsize(android.text.TextUtils.TruncateAt.END);
        chip.setBackground(ripple(Color.WHITE,BORDER,11));
        chip.setClickable(true);
        chip.setFocusable(true);
        chip.setOnClickListener(action);
        return chip;
    }

    private void selectRequestOrder() {
        final String[] options={"Fecha del viaje · próximas primero","Fecha de creación · recientes primero"};
        int selected="created".equals(requestOrder)?1:0;
        new AlertDialog.Builder(this).setTitle("Ordenar solicitudes")
            .setSingleChoiceItems(options,selected,(dialog,position)->{
                requestOrder=position==1?"created":"trip";
                dialog.dismiss();
                dashboard();
            }).setNegativeButton("Cancelar",null).show();
    }

    private void selectRequestFilter() {
        final String[] options={"Todas las solicitudes","Con aeropuerto","Con equipaje"};
        int selected="airport".equals(requestFilter)?1:
            "luggage".equals(requestFilter)?2:0;
        new AlertDialog.Builder(this).setTitle("Filtrar solicitudes")
            .setSingleChoiceItems(options,selected,(dialog,position)->{
                requestFilter=position==1?"airport":position==2?"luggage":"all";
                dialog.dismiss();
                dashboard();
            }).setNegativeButton("Cancelar",null).show();
    }

    private boolean requestMatches(JSONObject item) {
        if(!"all".equals(requestFilter)) {
            if("luggage".equals(requestFilter)&&item.optInt("bags",0)<1)return false;
            if("airport".equals(requestFilter)){
                String route=(item.optString("origin","")+" "+
                    item.optString("destination","")).toLowerCase(java.util.Locale.ROOT);
                if(!route.contains("aeropuerto")&&!route.contains("airport"))return false;
            }
        }
        String needle=requestSearch.trim().toLowerCase(java.util.Locale.ROOT);
        if(needle.isEmpty())return true;
        String haystack=(item.optString("id","")+" "+
            item.optString("origin","")+" "+item.optString("destination","")+" "+
            item.optString("name","")).toLowerCase(java.util.Locale.ROOT);
        return haystack.contains(needle);
    }

    private void showBookings(LinearLayout container,String mode) {
        // Remover las referencias a tarjetas anteriores después de buscar o filtrar.
        routeLabels.clear();
        routeSpinners.clear();
        routeCredits.clear();
        routeCards.clear();
        routeCardBookings.clear();
        container.removeAllViews();
        java.util.List<JSONObject> rows=new java.util.ArrayList<>();
        for(int i=0;i<bookings.length();i++){
            JSONObject item=bookings.optJSONObject(i);
            if(item==null)continue;
            String state=item.optString("status","");
            boolean include;
            if("solicitudes".equals(mode)){
                include="nuevas".equals(subtab)?"requested".equals(state):"quoted".equals(state);
                if(include)include=requestMatches(item);
            }else if("historial".equals(mode))
                include="completed".equals(state)||"cancelled".equals(state);
            else
                include="accepted".equals(state)||"confirmed".equals(state)
                    ||"en_route".equals(state)||"arrived".equals(state)||"in_progress".equals(state);
            if(include)rows.add(item);
        }
        if("solicitudes".equals(mode)){
            if("created".equals(requestOrder)){
                rows.sort((a,b)->Long.compare(b.optLong("created_at",0),
                    a.optLong("created_at",0)));
            }else{
                rows.sort((a,b)->{
                    String da=a.optString("date","")+" "+a.optString("time","");
                    String db=b.optString("date","")+" "+b.optString("time","");
                    return da.compareTo(db);
                });
            }
        }
        if(rows.isEmpty()){
            LinearLayout empty=card();
            empty.setPadding(dp(16),dp(15),dp(16),dp(15));
            addLine(empty,"Sin solicitudes para mostrar",15,INK,true,5);
            addLine(empty,"Probá otra pestaña o quitá los filtros.",
                12,MUTED,false,0);
            appendCard(container,empty,8);
        }else for(JSONObject item:rows)bookingCard(container,item);
        if("solicitudes".equals(mode)){
            String count=rows.size()+" resultado"+(rows.size()==1?"":"s");
            addLine(container,count+" · Actualización cada 20 s",11,MUTED,false,5);
        }
        handler.post(()->{if(!isFinishing())requestVisibleRoutes();});
    }

    private void lists(LinearLayout body, String mode) {
        if("solicitudes".equals(mode)){
            addLine(body,"Solicitudes",20,INK,true,7);
            LinearLayout tabs=row();
            tabs.setPadding(dp(3),dp(3),dp(3),dp(3));
            tabs.setBackground(bg(Color.rgb(231,241,239),12,0));
            String[] options={"Nuevas ("+count("requested")+")",
                ("admin".equals(staffRole)?"Con ofertas (":"Mis ofertas (")+
                count("quoted")+")"};
            String[] ids={"nuevas","ofertas"};
            for(int i=0;i<ids.length;i++){
                final String next=ids[i];
                boolean chosen=next.equals(subtab);
                TextView button=text(options[i],12,chosen?Color.WHITE:TEAL_DARK,chosen);
                button.setGravity(Gravity.CENTER);
                button.setSingleLine(true);
                button.setBackground(ripple(chosen?TEAL:Color.TRANSPARENT,0,10));
                button.setClickable(true);
                button.setFocusable(true);
                button.setContentDescription("Mostrar "+options[i]);
                button.setOnClickListener(v->{if(!next.equals(subtab)){subtab=next;dashboard();}});
                LinearLayout.LayoutParams part=new LinearLayout.LayoutParams(0,dp(40),1);
                if(i>0)part.leftMargin=dp(2);
                tabs.addView(button,part);
            }
            body.addView(tabs,new LinearLayout.LayoutParams(-1,dp(46)));
            spacer(body,7);

            LinearLayout toolbar=row();
            TextView order=requestControl("↕  "+
                ("created".equals(requestOrder)?"Recientes":"Fecha del viaje"),v->selectRequestOrder());
            toolbar.addView(order,new LinearLayout.LayoutParams(0,dp(40),1));
            TextView filter=requestControl("⚑  "+("all".equals(requestFilter)?
                "Filtro":"airport".equals(requestFilter)?"Aeropuerto":"Equipaje"),
                v->selectRequestFilter());
            LinearLayout.LayoutParams fp=new LinearLayout.LayoutParams(0,dp(40),0.84f);
            fp.leftMargin=dp(7);
            toolbar.addView(filter,fp);
            TextView search=requestControl("⌕",v->{
                requestSearchVisible=!requestSearchVisible;
                if(!requestSearchVisible)requestSearch="";
                dashboard();
            });
            search.setTextSize(21);
            search.setContentDescription(requestSearchVisible?"Cerrar búsqueda":"Buscar solicitud");
            LinearLayout.LayoutParams sp=new LinearLayout.LayoutParams(dp(42),dp(40));
            sp.leftMargin=dp(7);
            toolbar.addView(search,sp);
            body.addView(toolbar);
            if(requestSearchVisible){
                EditText input=new EditText(this);
                input.setSingleLine(true);
                input.setTextSize(14);
                input.setTextColor(INK);
                input.setHintTextColor(MUTED);
                input.setHint("Buscar por dirección, pasajero o número");
                input.setBackground(bg(Color.WHITE,11,BORDER));
                input.setPadding(dp(13),dp(9),dp(13),dp(9));
                input.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH);
                input.setText(requestSearch);
                LinearLayout.LayoutParams inputParams=new LinearLayout.LayoutParams(-1,dp(43));
                inputParams.topMargin=dp(8);
                body.addView(input,inputParams);
                // Se actualiza solo la lista, no la Activity ni el teclado.
                // Listener conectado después de crear el contenedor de resultados.
                LinearLayout results=column();
                LinearLayout.LayoutParams rp=new LinearLayout.LayoutParams(-1,-2);
                rp.topMargin=dp(10);
                body.addView(results,rp);
                input.addTextChangedListener(new android.text.TextWatcher(){
                    @Override public void beforeTextChanged(CharSequence s,int start,int count,int after){}
                    @Override public void onTextChanged(CharSequence s,int start,int before,int count){
                        requestSearch=s.toString();
                        showBookings(results,mode);
                    }
                    @Override public void afterTextChanged(android.text.Editable s){}
                });
                showBookings(results,mode);
                return;
            }
            spacer(body,8);
        }else if("viajes".equals(mode)){
            addLine(body,"Mis viajes",22,INK,true,4);
            addLine(body,"Aceptados, confirmados y en curso",12,MUTED,false,12);
        }else{
            addLine(body,"Historial",22,INK,true,4);
            addLine(body,"Finalizados y cancelados",12,MUTED,false,12);
        }
        LinearLayout results=column();
        body.addView(results,new LinearLayout.LayoutParams(-1,-2));
        showBookings(results,mode);
    }

    // Los kilómetros permanecen vinculados a la reserva y se solicitan una sola vez
    // por sesión. No repetimos llamadas de rutas con el refresco de 30 segundos.
    private final java.util.Map<String,JSONObject> routeResults=new java.util.HashMap<>();
    private final java.util.Set<String> routeStarted=new java.util.HashSet<>();
    private final java.util.Map<String,String> routeFailures=new java.util.HashMap<>();
    private final java.util.Map<String,TextView> routeLabels=new java.util.HashMap<>();
    private final java.util.Map<String,View> routeCards=new java.util.HashMap<>();
    private final java.util.Map<String,JSONObject> routeCardBookings=new java.util.HashMap<>();
    private final java.util.Map<String,android.widget.ProgressBar> routeSpinners=new java.util.HashMap<>();
    private final java.util.Map<String,TextView> routeCredits=new java.util.HashMap<>();
    private boolean routeProviderMissing=false;
    private long routeLastFailureAt=0;

    private String prettyAddress(String raw) {
        if(raw==null)return "";
        String value=raw.trim().replaceAll("\\s+"," ");
        value=value.replaceAll("(?i),\\s*Montevideo\\s*,\\s*Montevideo\\s*$",", Montevideo");
        String[] parts=value.split(",\\s*",-1);
        java.util.Locale es=new java.util.Locale("es","UY");
        for(int p=0;p<parts.length;p++){
            String segment=parts[p].trim();
            String onlyLetters=segment.replaceAll("[^\\p{L}]","");
            if(onlyLetters.length()<4 || !onlyLetters.equals(onlyLetters.toUpperCase(es)))continue;
            String low=segment.toLowerCase(es);
            StringBuilder pretty=new StringBuilder();
            boolean wordStart=true;
            for(int i=0;i<low.length();i++){
                char c=low.charAt(i);
                if(Character.isLetter(c)&&wordStart){pretty.append(Character.toUpperCase(c));wordStart=false;}
                else {pretty.append(c);if(!Character.isLetterOrDigit(c))wordStart=true;}
            }
            parts[p]=pretty.toString();
        }
        return android.text.TextUtils.join(", ",parts);
    }

    private String compactDate(String raw) {
        try {return java.time.LocalDate.parse(raw).format(
            java.time.format.DateTimeFormatter.ofPattern("d MMM",new java.util.Locale("es","UY")));}
        catch(Exception ignored){return raw;}
    }

    private String routeMetrics(JSONObject route) {
        if(route==null)return "Ruta pendiente";
        double distance=route.optDouble("distanceKm",Double.NaN);
        int minutes=route.optInt("durationMinutes",-1);
        if(!Double.isFinite(distance)||distance<=0||minutes<=0)return "Ruta pendiente";
        String duration=minutes>=60?
            (minutes/60)+" h "+(minutes%60)+" min":minutes+" min";
        return String.format(new java.util.Locale("es","UY"),"%.1f km · %s",
            distance,duration);
    }

    private void showRouteState(String id) {
        TextView label=routeLabels.get(id);
        android.widget.ProgressBar spinner=routeSpinners.get(id);
        if(label==null)return;
        JSONObject route=routeResults.get(id);
        boolean pending=routeStarted.contains(id) && route==null && !routeFailures.containsKey(id);
        if(spinner!=null)spinner.setVisibility(pending?View.VISIBLE:View.GONE);
        TextView credits=routeCredits.get(id);
        if(credits!=null)credits.setVisibility(route!=null?View.VISIBLE:View.GONE);
        if(route!=null){
            label.setText(routeMetrics(route));
            label.setTextColor(TEAL_DARK);
        }else if(routeProviderMissing||"provider_missing".equals(routeFailures.get(id))){
            label.setText("Ruta pendiente de activar");
            label.setTextColor(MUTED);
        }else if(routeFailures.containsKey(id)){
            label.setText("Ruta no disponible");
            label.setTextColor(MUTED);
        }else {
            label.setText("Calculando ruta…");
            label.setTextColor(MUTED);
        }
    }

    private void requestVisibleRoutes() {
        if(!"solicitudes".equals(tab)&&!"viajes".equals(tab)&&!"historial".equals(tab))
            return;
        if(routeLastFailureAt>0 &&
            android.os.SystemClock.elapsedRealtime()-routeLastFailureAt>120000L){
            routeFailures.clear();
            routeProviderMissing=false;
            routeLastFailureAt=0;
        }
        for(java.util.Map.Entry<String,View> entry:routeCards.entrySet()){
            android.graphics.Rect visibleRect=new android.graphics.Rect();
            View card=entry.getValue();
            if(card.getGlobalVisibleRect(visibleRect)&&visibleRect.height()>dp(20)){
                JSONObject booking=routeCardBookings.get(entry.getKey());
                if(booking!=null)requestRouteAutomatically(booking);
            }
        }
    }

    private void requestRouteAutomatically(JSONObject booking) {
        String id=booking.optString("id","");
        if(id.isEmpty()||routeResults.containsKey(id)||routeStarted.contains(id))return;
        if(routeProviderMissing) {
            routeFailures.put(id,"provider_missing");
            showRouteState(id);
            return;
        }
        if(routeFailures.containsKey(id)){showRouteState(id);return;}
        routeStarted.add(id);
        showRouteState(id);
        api("GET","/api/operator/requests/"+Uri.encode(id)+"/route",null,(status,body,error)->{
            routeStarted.remove(id);
            if(status==200){
                try {
                    JSONObject route=new JSONObject(body);
                    if(route.optDouble("distanceKm",0)>0 && route.optInt("durationMinutes",0)>0){
                        routeResults.put(id,route);
                        routeFailures.remove(id);
                        routeLastFailureAt=0;
                        showRouteState(id);
                        return;
                    }
                }catch(Exception ignored){}
            }
            if(status==503){
                try{
                    JSONObject payload=new JSONObject(body);
                    if("route_provider_missing".equals(payload.optString("reason"))){
                        routeProviderMissing=true;
                        routeFailures.put(id,"provider_missing");
                        for(String other:routeLabels.keySet())showRouteState(other);
                    }else routeFailures.put(id,"unavailable");
                }catch(Exception ignored){routeFailures.put(id,"unavailable");}
            }else routeFailures.put(id,"unavailable");
            routeLastFailureAt=android.os.SystemClock.elapsedRealtime();
            showRouteState(id);
        });
    }

    private void compactRouteRow(LinearLayout parent,String pinText,String address,
            boolean origin){
        LinearLayout routeRow=row();
        TextView pin=text(pinText,10,origin?Color.WHITE:TEAL_DARK,true);
        pin.setGravity(Gravity.CENTER);
        pin.setBackground(bg(origin?TEAL:SOFT,8,origin?0:BORDER));
        pin.setContentDescription(origin?"Origen":"Destino");
        LinearLayout.LayoutParams pinParams=new LinearLayout.LayoutParams(dp(22),dp(22));
        routeRow.addView(pin,pinParams);
        TextView value=text(prettyAddress(address),13,INK,true);
        value.setMaxLines(2);
        value.setEllipsize(android.text.TextUtils.TruncateAt.END);
        value.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams valueParams=new LinearLayout.LayoutParams(0,-2,1);
        valueParams.leftMargin=dp(9);
        routeRow.addView(value,valueParams);
        parent.addView(routeRow,new LinearLayout.LayoutParams(-1,-2));
    }

    private void bookingCard(LinearLayout parent,JSONObject item){
        final String status=item.optString("status","");
        final String id=item.optString("id","");
        LinearLayout tile=column();
        tile.setPadding(dp(12),dp(11),dp(12),dp(11));
        tile.setBackground(bg(Color.WHITE,15,BORDER));
        tile.setClickable(true);
        tile.setFocusable(true);
        tile.setOnClickListener(v->details(item));
        tile.setContentDescription(statusName(status)+" · "+
            compactDate(item.optString("date",""))+" "+item.optString("time","")+
            " · "+prettyAddress(item.optString("origin"))+" a "+
            prettyAddress(item.optString("destination"))+". Abrir detalle.");

        LinearLayout head=row();
        TextView date=text(compactDate(item.optString("date",""))+
            " · "+item.optString("time",""),14,INK,true);
        date.setSingleLine(true);
        date.setEllipsize(android.text.TextUtils.TruncateAt.END);
        head.addView(date,new LinearLayout.LayoutParams(0,-2,1));
        TextView statusChip=text(statusName(status),10,stateColor(status),true);
        statusChip.setGravity(Gravity.CENTER);
        statusChip.setPadding(dp(8),dp(5),dp(8),dp(5));
        statusChip.setBackground(bg(SOFT,10,0));
        LinearLayout.LayoutParams chipParams=new LinearLayout.LayoutParams(-2,-2);
        chipParams.leftMargin=dp(7);
        head.addView(statusChip,chipParams);
        tile.addView(head);

        LinearLayout second=row();
        TextView reference=text(id,11,MUTED,false);
        reference.setSingleLine(true);
        reference.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);
        second.addView(reference,new LinearLayout.LayoutParams(0,-2,1));
        if("quoted".equals(status)&&item.optInt("price",0)>0){
            TextView amount=text("$ "+String.format(new java.util.Locale("es","UY"),
                "%,d",item.optInt("price"))+" UYU",12,TEAL_DARK,true);
            second.addView(amount);
        }
        LinearLayout.LayoutParams secondParams=new LinearLayout.LayoutParams(-1,-2);
        secondParams.topMargin=dp(3);
        tile.addView(second,secondParams);
        spacer(tile,7);

        compactRouteRow(tile,"A",item.optString("origin",""),true);
        spacer(tile,4);
        compactRouteRow(tile,"B",item.optString("destination",""),false);
        spacer(tile,8);

        LinearLayout metrics=row();
        LinearLayout distanceGroup=row();
        android.widget.ProgressBar spinner=new android.widget.ProgressBar(this,null,
            android.R.attr.progressBarStyleSmall);
        spinner.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(TEAL));
        LinearLayout.LayoutParams spinParams=new LinearLayout.LayoutParams(dp(13),dp(13));
        spinParams.rightMargin=dp(5);
        distanceGroup.addView(spinner,spinParams);
        TextView routeValue=text("Calculando ruta…",12,MUTED,true);
        routeValue.setSingleLine(true);
        routeValue.setEllipsize(android.text.TextUtils.TruncateAt.END);
        distanceGroup.addView(routeValue,new LinearLayout.LayoutParams(0,-2,1));
        metrics.addView(distanceGroup,new LinearLayout.LayoutParams(0,-2,1));
        int pax=item.optInt("passengers",1),bags=item.optInt("bags",0);
        TextView capacity=text(pax+" pax · "+bags+" val.",11,MUTED,false);
        capacity.setSingleLine(true);
        capacity.setContentDescription(pax+" pasajero"+(pax==1?"":"s")+
            ", "+bags+" valija"+(bags==1?"":"s"));
        LinearLayout.LayoutParams capParams=new LinearLayout.LayoutParams(-2,-2);
        capParams.leftMargin=dp(6);
        metrics.addView(capacity,capParams);
        tile.addView(metrics);

        // Atribución visible al disponerse de métricas del proveedor, con enlaces.
        TextView attribution=text("",10,MUTED,false);
        String source="Powered by Geoapify · © OpenStreetMap contributors";
        android.text.SpannableString license=new android.text.SpannableString(source);
        int geo=source.indexOf("Geoapify"), osm=source.indexOf("© OpenStreetMap");
        license.setSpan(new android.text.style.URLSpan("https://www.geoapify.com/"),
            geo,geo+"Geoapify".length(),android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        license.setSpan(new android.text.style.URLSpan("https://www.openstreetmap.org/copyright"),
            osm,source.length(),android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        if(BuildConfig.VIA_PREVIEW){
            attribution.setText("Ruta ilustrativa · sin servicios externos");
        }else{
            attribution.setText(license);
            attribution.setMovementMethod(android.text.method.LinkMovementMethod.getInstance());
        }
        LinearLayout.LayoutParams attribParams=new LinearLayout.LayoutParams(-1,-2);
        attribParams.topMargin=dp(3);
        tile.addView(attribution,attribParams);

        if(!id.isEmpty()){
            routeLabels.put(id,routeValue);
            routeSpinners.put(id,spinner);
            routeCredits.put(id,attribution);
            routeCards.put(id,tile);
            routeCardBookings.put(id,item);
            JSONObject saved=item.optJSONObject("route");
            if(saved!=null&&saved.optDouble("distanceKm",0)>0&&
                saved.optInt("durationMinutes",0)>0)routeResults.put(id,saved);
            showRouteState(id);
        }else {
            spinner.setVisibility(View.GONE);
            attribution.setVisibility(View.GONE);
            routeValue.setText("Ruta pendiente");
        }
        // En todas las tarjetas se puede tocar cualquier zona para abrir el detalle.
        // En las cotizadas no duplicamos esa acción en una fila de 42 dp.
        if("requested".equals(status)&&item.optBoolean("canQuote",
            BuildConfig.VIA_PREVIEW||"admin".equals(staffRole))){
            spacer(tile,9);
            View separator=new View(this);
            separator.setBackgroundColor(BORDER);
            tile.addView(separator,new LinearLayout.LayoutParams(-1,dp(1)));
            spacer(tile,5);
            LinearLayout actions=row();
            TextView see=actionText("Ver detalle  ›",TEAL_DARK,v->details(item));
            see.setTextSize(12);
            see.setMinHeight(dp(42));
            see.setGravity(Gravity.LEFT|Gravity.CENTER_VERTICAL);
            see.setPadding(dp(1),0,0,0);
            actions.addView(see,new LinearLayout.LayoutParams(0,dp(42),1));
            Button quoteButton=button("Sugerir precio",true,v->quote(item));
            quoteButton.setTextSize(12);
            quoteButton.setMinHeight(0);
            quoteButton.setMinimumHeight(0);
            quoteButton.setPadding(dp(9),0,dp(9),0);
            LinearLayout.LayoutParams quoteParams=
                new LinearLayout.LayoutParams(dp(130),dp(42));
            quoteParams.leftMargin=dp(6);
            actions.addView(quoteButton,quoteParams);
            tile.addView(actions);
        }
        appendCard(parent,tile,7);
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

    // V26: pantalla de consulta a tamaño completo; no un AlertDialog largo.
    private Dialog premiumPage(String eyebrow, String title, String subtitle, String state,
            LinearLayout[] sections) {
        Dialog dialog=new Dialog(this,android.R.style.Theme_Material_Light_NoActionBar);
        LinearLayout page=column();
        page.setBackgroundColor(LIGHT);
        LinearLayout header=row();
        header.setBackgroundColor(Color.WHITE);
        header.setPadding(dp(12),dp(7),dp(14),dp(7));
        TextView back=actionText("‹",TEAL_DARK,v->dialog.dismiss());
        back.setTextSize(28);
        back.setContentDescription("Volver al panel");
        header.addView(back,new LinearLayout.LayoutParams(dp(44),dp(44)));
        LinearLayout heading=column();
        addLine(heading,title,19,INK,true,2);
        addLine(heading,subtitle,11,MUTED,false,0);
        header.addView(heading,new LinearLayout.LayoutParams(0,-2,1));
        if(state!=null&&!state.isEmpty()){
            TextView flag=text(state,11,TEAL_DARK,true);
            flag.setGravity(Gravity.CENTER);
            flag.setPadding(dp(9),dp(7),dp(9),dp(7));
            flag.setBackground(bg(SOFT,12,0));
            header.addView(flag);
        }
        page.addView(header,new LinearLayout.LayoutParams(-1,-2));
        View separator=new View(this);
        separator.setBackgroundColor(BORDER);
        page.addView(separator,new LinearLayout.LayoutParams(-1,dp(1)));

        ScrollView scroll=new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        LinearLayout body=column();
        body.setPadding(dp(14),dp(12),dp(14),dp(14));
        if(eyebrow!=null&&!eyebrow.isEmpty()){
            TextView over=text(eyebrow,10,TEAL_DARK,true);
            over.setLetterSpacing(0.13f);
            body.addView(over);
            spacer(body,10);
        }
        scroll.addView(body);
        page.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout footer=column();
        footer.setBackgroundColor(Color.WHITE);
        footer.setPadding(dp(14),dp(8),dp(14),dp(10));
        sections[0]=body;
        sections[1]=footer;
        page.addView(footer,new LinearLayout.LayoutParams(-1,-2));
        dialog.setContentView(page);
        dialog.show();
        Window window=dialog.getWindow();
        if(window!=null){
            window.setBackgroundDrawableResource(android.R.color.white);
            window.setLayout(WindowManager.LayoutParams.MATCH_PARENT,WindowManager.LayoutParams.MATCH_PARENT);
        }
        return dialog;
    }

    private void premiumFact(LinearLayout parent,String label,String value) {
        LinearLayout tile=column();
        tile.setPadding(dp(13),dp(12),dp(13),dp(12));
        tile.setBackground(bg(SOFT,13,0));
        addLine(tile,label,10,MUTED,true,6);
        addLine(tile,value,15,INK,true,0);
        parent.addView(tile,new LinearLayout.LayoutParams(0,-2,1));
    }

    private void premiumKeyValue(LinearLayout parent,String label,String value,boolean important) {
        addLine(parent,label,10,MUTED,true,4);
        addLine(parent,value,important?15:13,important?INK:MUTED,important,11);
    }

    // Vista V28: detalles completos en menos tarjetas sin ocultar información útil.
    private void routePoint(LinearLayout parent,String marker,String label,String address,
            boolean origin){
        LinearLayout row=row();
        row.setGravity(Gravity.TOP);
        TextView pin=text(marker,11,origin?Color.WHITE:TEAL_DARK,true);
        pin.setGravity(Gravity.CENTER);
        pin.setBackground(bg(origin?TEAL_DARK:SOFT,22,0));
        row.addView(pin,new LinearLayout.LayoutParams(dp(27),dp(27)));
        LinearLayout content=column();
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-2,1);
        lp.leftMargin=dp(10);
        row.addView(content,lp);
        addLine(content,label,10,MUTED,true,5);
        addLine(content,prettyAddress(address),14,INK,true,0);
        parent.addView(row);
    }

    private void details(JSONObject item) {
        final String id=item.optString("id","");
        final String state=item.optString("status","");
        LinearLayout[] views=new LinearLayout[2];
        Dialog panel=premiumPage("DETALLE DEL SERVICIO","Detalle del traslado",id,statusName(state),views);
        LinearLayout body=views[0],footer=views[1];

        LinearLayout facts=row();
        LinearLayout date=column();
        date.setPadding(dp(12),dp(10),dp(10),dp(10));
        date.setBackground(bg(SOFT,12,0));
        addLine(date,"FECHA Y HORA",10,MUTED,true,5);
        addLine(date,compactDate(item.optString("date"))+" · "+item.optString("time"),14,INK,true,0);
        facts.addView(date,new LinearLayout.LayoutParams(0,-2,1));
        JSONObject route=routeResults.get(id);
        if(route==null)route=item.optJSONObject("route");
        final JSONObject measured=route;
        LinearLayout metric=column();
        metric.setPadding(dp(12),dp(10),dp(10),dp(10));
        metric.setBackground(bg(SOFT,12,0));
        addLine(metric,"DISTANCIA / TIEMPO",10,MUTED,true,5);
        addLine(metric,measured==null?"Pendiente":routeMetrics(measured),14,
            measured==null?MUTED:TEAL_DARK,true,0);
        LinearLayout.LayoutParams mp=new LinearLayout.LayoutParams(0,-2,1);
        mp.leftMargin=dp(7);
        facts.addView(metric,mp);
        body.addView(facts);
        spacer(body,10);

        LinearLayout itinerary=card();
        itinerary.setPadding(dp(13),dp(13),dp(13),dp(11));
        addLine(itinerary,"RECORRIDO",10,TEAL_DARK,true,12);
        routePoint(itinerary,"A","ORIGEN",item.optString("origin"),true);
        spacer(itinerary,13);
        routePoint(itinerary,"B","DESTINO",item.optString("destination"),false);
        spacer(itinerary,12);
        View routeSeparator=new View(this);
        routeSeparator.setBackgroundColor(BORDER);
        itinerary.addView(routeSeparator,new LinearLayout.LayoutParams(-1,dp(1)));
        spacer(itinerary,9);
        int passengerCount=item.optInt("passengers",1),luggageCount=item.optInt("bags",0);
        String paxText=passengerCount+" "+(passengerCount==1?"pasajero":"pasajeros");
        String luggageText=luggageCount+" "+(luggageCount==1?"valija":"valijas");
        LinearLayout serviceData=row();
        TextView pax=text(paxText,12,INK,true);
        serviceData.addView(pax,new LinearLayout.LayoutParams(0,-2,1));
        TextView baggage=text(luggageText,12,INK,true);
        serviceData.addView(baggage);
        itinerary.addView(serviceData);
        if(item.optInt("price",0)>0){
            spacer(itinerary,10);
            LinearLayout fare=row();
            fare.setGravity(Gravity.CENTER_VERTICAL);
            fare.setPadding(dp(11),dp(10),dp(11),dp(10));
            fare.setBackground(bg(SOFT,11,0));
            TextView fareLabel=text("IMPORTE OFERTADO",10,MUTED,true);
            fareLabel.setGravity(Gravity.CENTER_VERTICAL);
            fare.addView(fareLabel,new LinearLayout.LayoutParams(0,-2,1));
            TextView total=text("$ "+String.format(new java.util.Locale("es","UY"),
                "%,d",item.optInt("price"))+" UYU",16,TEAL_DARK,true);
            total.setGravity(Gravity.RIGHT|Gravity.CENTER_VERTICAL);
            total.setSingleLine(true);
            fare.addView(total,new LinearLayout.LayoutParams(-2,-2));
            itinerary.addView(fare,new LinearLayout.LayoutParams(-1,-2));
        }
        spacer(itinerary,7);
        if(measured!=null){
            TextView credit=text("",9,MUTED,false);
            if(BuildConfig.VIA_PREVIEW){
                credit.setText("Ruta ilustrativa · sin servicios externos");
            }else{
                String attribution="Powered by Geoapify · © OpenStreetMap contributors";
                android.text.SpannableString license=new android.text.SpannableString(attribution);
                int geo=attribution.indexOf("Geoapify");
                int osm=attribution.indexOf("© OpenStreetMap");
                license.setSpan(new android.text.style.URLSpan("https://www.geoapify.com/"),
                    geo,geo+"Geoapify".length(),android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                license.setSpan(new android.text.style.URLSpan("https://www.openstreetmap.org/copyright"),
                    osm,attribution.length(),android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                credit.setText(license);
                credit.setMovementMethod(android.text.method.LinkMovementMethod.getInstance());
            }
            itinerary.addView(credit);
        }
        if(!BuildConfig.VIA_PREVIEW){
            TextView maps=actionText("↗  Abrir ruta en Google Maps",TEAL_DARK,v->openMaps(item));
            maps.setTextSize(12);
            maps.setGravity(Gravity.LEFT|Gravity.CENTER_VERTICAL);
            maps.setPadding(0,0,0,0);
            itinerary.addView(maps,new LinearLayout.LayoutParams(-1,dp(38)));
        }
        appendCard(body,itinerary,10);

        // Pasajero y asignación comparten una sola tarjeta de operaciones.
        LinearLayout people=card();
        people.setPadding(dp(13),dp(13),dp(13),dp(11));
        LinearLayout customerHeader=row();
        TextView customerTag=text("PASAJERO",10,TEAL_DARK,true);
        customerTag.setGravity(Gravity.CENTER_VERTICAL);
        customerHeader.addView(customerTag,new LinearLayout.LayoutParams(0,dp(30),1));
        String phone=item.optString("phone","");
        TextView call=actionText("☎  Llamar",TEAL_DARK,v->{
            if(BuildConfig.VIA_PREVIEW){message("Demo: no se realizan llamadas.");return;}
            try{startActivity(new Intent(Intent.ACTION_DIAL,Uri.parse("tel:"+Uri.encode(phone))));}
            catch(Exception e){message("No se pudo abrir el teléfono.");}
        });
        call.setTextSize(12);
        call.setGravity(Gravity.RIGHT|Gravity.CENTER_VERTICAL);
        call.setPadding(dp(8),0,0,0);
        call.setEnabled(!phone.isEmpty());
        customerHeader.addView(call,new LinearLayout.LayoutParams(-2,dp(38)));
        people.addView(customerHeader);
        addLine(people,item.optString("name","Sin nombre"),15,INK,true,4);
        if(!phone.isEmpty())addLine(people,phone,12,MUTED,false,3);
        String email=item.optString("email","");
        if(!email.isEmpty())addLine(people,email,12,MUTED,false,9);
        spacer(people,7);
        View peopleLine=new View(this);
        peopleLine.setBackgroundColor(BORDER);
        people.addView(peopleLine,new LinearLayout.LayoutParams(-1,dp(1)));
        spacer(people,12);
        addLine(people,"CONDUCTOR",10,TEAL_DARK,true,7);
        final boolean assignable="admin".equals(staffRole)&&(
            "requested".equals(state)||"quoted".equals(state)||
            "accepted".equals(state)||"confirmed".equals(state));
        String assigned=item.optString("assignedDriverName","");
        if("null".equals(assigned))assigned="";
        final boolean hasDriver=!assigned.isEmpty();
        addLine(people,hasDriver?assigned:"Sin asignar",15,INK,true,4);
        addLine(people,hasDriver?
            "Asignado · ubicación no verificada":
            "Pendiente de seleccionar un conductor habilitado",11,MUTED,false,0);
        if(assignable&&hasDriver){
            TextView change=actionText("Cambiar conductor  ›",TEAL_DARK,v->{
                panel.dismiss();driverAssignmentDialog(item);
            });
            change.setTextSize(12);
            change.setGravity(Gravity.LEFT|Gravity.CENTER_VERTICAL);
            change.setPadding(0,0,0,0);
            people.addView(change,new LinearLayout.LayoutParams(-1,dp(38)));
        }
        appendCard(body,people,10);

        String notes=item.optString("notes","");
        if(!notes.isEmpty()&&!"null".equals(notes)){
            LinearLayout extra=column();
            extra.setPadding(dp(5),dp(2),dp(5),dp(7));
            addLine(extra,"INDICACIONES",10,MUTED,true,5);
            addLine(extra,notes,12,INK,false,0);
            body.addView(extra);
            spacer(body,7);
        }

        // Cotizar es la acción principal del pie. La asignación manual queda
        // como operación secundaria exclusiva del administrador.
        final boolean canQuote="requested".equals(state)&&item.optBoolean("canQuote",
            BuildConfig.VIA_PREVIEW||"admin".equals(staffRole));
        if(assignable&&!hasDriver){
            TextView manual=actionText("Asignar otro conductor manualmente  ›",
                TEAL_DARK,v->{
                    panel.dismiss();driverAssignmentDialog(item);
                });
            manual.setTextSize(12);
            manual.setGravity(Gravity.LEFT|Gravity.CENTER_VERTICAL);
            manual.setPadding(dp(4),0,0,0);
            body.addView(manual,new LinearLayout.LayoutParams(-1,dp(40)));
        }
        if("requested".equals(state)&&item.optBoolean("canRelease",false)
            &&!hasDriver){
            TextView release=actionText("Liberar solicitud a conductores  ›",
                TEAL_DARK,v->new AlertDialog.Builder(this)
                    .setTitle("Liberar solicitud")
                    .setMessage("La solicitud será visible para los conductores contratados habilitados. "+
                        "El primero que envíe una propuesta válida quedará asignado.")
                    .setNegativeButton("Volver",null)
                    .setPositiveButton("Liberar",(dialog,which)->api("POST",
                        "/api/operator/requests/"+Uri.encode(id)+"/release",
                        new JSONObject(),(status,result,error)->{
                            if(status==200){
                                panel.dismiss();
                                message("Solicitud liberada.");
                                fetchBookings(true);
                            }else message(error.isEmpty()?"No se pudo liberar la solicitud.":error);
                        })).show());
            release.setTextSize(12);
            release.setGravity(Gravity.LEFT|Gravity.CENTER_VERTICAL);
            body.addView(release,new LinearLayout.LayoutParams(-1,dp(40)));
        }
        if("requested".equals(state)||"quoted".equals(state)||
           "accepted".equals(state)||"confirmed".equals(state)||
           "en_route".equals(state)||"arrived".equals(state)){
            TextView cancel=actionText("Cancelar solicitud",ORANGE,v->{
                panel.dismiss();confirmStatus(item,"cancelled","Cancelar solicitud");
            });
            cancel.setGravity(Gravity.LEFT|Gravity.CENTER_VERTICAL);
            cancel.setTextSize(12);
            cancel.setPadding(dp(4),0,0,0);
            body.addView(cancel,new LinearLayout.LayoutParams(-1,dp(38)));
        }

        String next="",nextTitle="";
        switch(state){
            case "accepted": next="confirmed";nextTitle="Confirmar servicio";break;
            case "confirmed": next="en_route";nextTitle="Salir hacia el pasajero";break;
            case "en_route": next="arrived";nextTitle="Marcar llegada";break;
            case "arrived": next="in_progress";nextTitle="Iniciar traslado";break;
            case "in_progress": next="completed";nextTitle="Finalizar traslado";break;
        }
        if(canQuote){
            footer.addView(button("Cotizar y tomar viaje   →",true,v->{
                panel.dismiss();quote(item);
            }),new LinearLayout.LayoutParams(-1,dp(46)));
        }else if(assignable&&!hasDriver){
            footer.addView(button("Asignar conductor   →",true,v->{
                panel.dismiss();driverAssignmentDialog(item);
            }),new LinearLayout.LayoutParams(-1,dp(46)));
        }else if(!next.isEmpty()){
            final String finalState=next,finalTitle=nextTitle;
            footer.addView(button(finalTitle+"   →",true,v->{
                panel.dismiss();confirmStatus(item,finalState,finalTitle);
            }),new LinearLayout.LayoutParams(-1,dp(46)));
        }else{
            footer.addView(button("Volver al panel",false,v->panel.dismiss()),
                new LinearLayout.LayoutParams(-1,dp(46)));
        }
    }

    private void openMaps(JSONObject item) {
        if(BuildConfig.VIA_PREVIEW){message("Demo: no se abre navegación real.");return;}
        try {
            String origin=URLEncoder.encode(item.optString("origin"),"UTF-8");
            String dest=URLEncoder.encode(item.optString("destination"),"UTF-8");
            String url="https://www.google.com/maps/dir/?api=1&origin="
                +origin+"&destination="+dest+"&travelmode=driving";
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch(Exception e) { message("No fue posible abrir el mapa."); }
    }

    private void quote(JSONObject item) {
        if(!item.optBoolean("canQuote",BuildConfig.VIA_PREVIEW||
            "admin".equals(staffRole))) {
            message("Esta solicitud aún no está habilitada para tu cuenta.");
            return;
        }
        String id=item.optString("id","");
        LinearLayout[] views=new LinearLayout[2];
        Dialog panel=premiumPage("PRESUPUESTO ORIENTATIVO","Cotizar traslado",
            id,"Tomar viaje",views);
        LinearLayout body=views[0],footer=views[1];
        LinearLayout route=card();
        addLine(route,"RECORRIDO",10,TEAL_DARK,true,8);
        addLine(route,prettyAddress(item.optString("origin")),14,INK,true,5);
        addLine(route,"→  "+prettyAddress(item.optString("destination")),14,INK,true,10);
        JSONObject measured=routeResults.get(id);
        if(measured==null)measured=item.optJSONObject("route");
        addLine(route,measured==null?"Ruta pendiente de cálculo":
            routeMetrics(measured)+" · sin tráfico en vivo",12,MUTED,false,0);
        appendCard(body,route,11);
        addLine(body,"TARIFA DE REFERENCIA",10,TEAL_DARK,true,10);
        addLine(body,"Son valores orientativos. Elegí uno o escribí tu oferta en pesos uruguayos.",
            12,MUTED,false,10);
        LinearLayout bands=row();
        body.addView(bands);
        TextView info=text("Consultando tarifa orientativa…",12,MUTED,false);
        LinearLayout.LayoutParams ip=new LinearLayout.LayoutParams(-1,-2);
        ip.topMargin=dp(10);
        body.addView(info,ip);
        spacer(body,13);
        LinearLayout amountBox=card();
        addLine(amountBox,"IMPORTE AL PASAJERO · UYU",10,MUTED,true,9);
        EditText price=new EditText(this);
        price.setInputType(InputType.TYPE_CLASS_NUMBER);
        price.setSingleLine(true);
        price.setTextSize(22);
        price.setHint("$ 0");
        price.setTextColor(INK);
        amountBox.addView(price,new LinearLayout.LayoutParams(-1,dp(52)));
        appendCard(body,amountBox,10);
        TextView financials=text("",12,TEAL_DARK,false);
        body.addView(financials);
        addLine(body,"Al enviar la propuesta, el viaje se asignará a tu cuenta. "+
            "El pasajero deberá aceptarla y luego se confirmará el servicio.",
            12,MUTED,false,0);

        Button submit=button("Enviar propuesta y tomar viaje  →",true,null);
        footer.addView(submit,new LinearLayout.LayoutParams(-1,dp(46)));
        final int[] feeBps={0};
        final boolean[] guideReady={false};
        price.addTextChangedListener(new android.text.TextWatcher(){
            public void beforeTextChanged(CharSequence s,int start,int count,int after){}
            public void onTextChanged(CharSequence s,int start,int before,int count){
                try{
                    long value=Long.parseLong(s.toString());
                    double fee=value*feeBps[0]/10000.0;
                    financials.setText("Importe neto estimado para vos: $ "+
                        String.format(new java.util.Locale("es","UY"),"%,.2f",value-fee)+
                        " UYU · comisión $ "+
                        String.format(new java.util.Locale("es","UY"),"%,.2f",fee));
                }catch(Exception ignored){financials.setText("Ingresá un importe en UYU.");}
            }
            public void afterTextChanged(android.text.Editable s){}
        });
        api("GET","/api/operator/requests/"+Uri.encode(id)+"/price-guide",null,
            (status,response,error)->{
            if(!panel.isShowing())return;
            bands.removeAllViews();
            if(status!=200){
                info.setText("No hay guía disponible. Podés cotizar manualmente.");
                return;
            }
            try{
                JSONObject payload=new JSONObject(response);
                JSONObject guide=payload.optJSONObject("guide");
                if(!payload.optBoolean("canQuote",true)){
                    submit.setEnabled(false);
                    info.setText("Esta solicitud ya no se puede cotizar.");
                    return;
                }
                JSONObject example=payload.optJSONObject("exampleAtSuggested");
                if(example!=null)feeBps[0]=example.optInt("commissionBps",0);
                if(guide==null){
                    info.setText("Todavía no está calculada la ruta. Ingresá una tarifa manual.");
                    return;
                }
                int[] values={guide.optInt("minimum"),guide.optInt("suggested"),
                    guide.optInt("maximum")};
                String[] labels={"MÍNIMO","SUGERIDO","MÁXIMO"};
                for(int i=0;i<3;i++){
                    final int value=values[i];
                    LinearLayout box=column();
                    box.setPadding(dp(7),dp(9),dp(7),dp(9));
                    box.setBackground(ripple(i==1?SOFT:Color.WHITE,BORDER,12));
                    TextView title=text(labels[i],9,MUTED,true);
                    title.setGravity(Gravity.CENTER);
                    box.addView(title);
                    spacer(box,5);
                    TextView sum=text("$ "+
                        String.format(new java.util.Locale("es","UY"),"%,d",value),
                        15,i==1?TEAL_DARK:INK,true);
                    sum.setGravity(Gravity.CENTER);
                    box.addView(sum);
                    box.setContentDescription(labels[i]+": "+value+" pesos. Usar esta tarifa.");
                    box.setOnClickListener(v->price.setText(String.valueOf(value)));
                    LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(62),1);
                    if(i>0)p.leftMargin=dp(7);
                    bands.addView(box,p);
                }
                price.setText(String.valueOf(values[1]));
                guideReady[0]=true;
                info.setText("Guía Vía Traslados · no incluye peajes, esperas ni regreso vacío.");
            }catch(Exception e){info.setText("No se pudo interpretar la guía. Cotizá manualmente.");}
        });
        submit.setOnClickListener(v->{
            final int value;
            try{
                value=Integer.parseInt(price.getText().toString().trim());
                if(value<1||value>10000000)throw new IllegalArgumentException();
            }catch(Exception e){message("Ingresá una tarifa válida en pesos uruguayos.");return;}
            new AlertDialog.Builder(this)
                .setTitle("Confirmar propuesta")
                .setMessage("Ofertar $ "+String.format(new java.util.Locale("es","UY"),"%,d",value)+
                    " UYU y adjudicarte este viaje. El pasajero todavía deberá aceptar tu propuesta.")
                .setNegativeButton("Volver",null)
                .setPositiveButton("Enviar y tomar",(dialog,which)->{
                    submit.setEnabled(false);
                    try{
                        JSONObject patch=new JSONObject().put("status","quoted").put("price",value);
                        api("PATCH","/api/operator/requests/"+Uri.encode(id),patch,
                            (status,result,error)->{
                            if(status==200){
                                panel.dismiss();
                                message("Propuesta enviada. El viaje quedó asignado a tu cuenta.");
                                fetchBookings(true);
                            }else{
                                submit.setEnabled(true);
                                message(error.isEmpty()?
                                    "No se pudo cotizar. Puede haber sido tomado por otro conductor.":
                                    error);
                                fetchBookings(false);
                            }
                        });
                    }catch(Exception e){submit.setEnabled(true);message("No se pudo enviar la cotización.");}
                }).show();
        });
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
        LinearLayout form=formContainer();
        EditText phone=formInput(form,"Celular, por ejemplo 099 123 456",
            InputType.TYPE_CLASS_PHONE);
        EditText password=formInput(form,"Contraseña",
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        new AlertDialog.Builder(this)
            .setTitle("Acceso con celular")
            .setMessage("La dirección de correo se usa solamente para verificar la cuenta y recuperar el acceso.")
            .setView(form)
            .setNegativeButton("Cancelar",null)
            .setPositiveButton("Ingresar",(dialog,which)->{
                JSONObject p=new JSONObject();
                try{
                    p.put("phone",phone.getText().toString().trim());
                    p.put("password",password.getText().toString());
                }catch(Exception ignored){}
                password.setText("");
                signInPending();
                api("POST","/api/staff/login-phone",p,(status,result,error)->{
                    if(status==200){
                        try{
                            JSONObject response=new JSONObject(result);
                            JSONObject user=response.getJSONObject("user");
                            staffToken=response.getString("token");
                            staffRefreshToken=response.getString("refreshToken");
                            operatorKey=null;
                            staffRole=user.getString("role");
                            staffName=user.optString("name","");
                            tab="solicitudes";
                            adminLoaded=false;
                            fetchBookings(true);
                            offerBiometric();
                        }catch(Exception e){
                            loginScreen();
                            message("No se pudo completar el ingreso.");
                        }
                    }else{
                        loginScreen();
                        new AlertDialog.Builder(this).setTitle("No se pudo ingresar")
                            .setMessage(error.isEmpty()?"Comprobá tu celular y contraseña.":error)
                            .setPositiveButton("Entendido",null).show();
                    }
                });
            }).show();
    }

    private void offerBiometric(){
        if(staffRefreshToken==null||BiometricVault.hasSaved(this)||!BiometricVault.supported(this))return;
        new AlertDialog.Builder(this).setTitle("Ingresar con huella")
            .setMessage("¿Querés activar la huella para futuros ingresos? Solo se guarda una sesión cifrada con Android Keystore; nunca tu contraseña.")
            .setNegativeButton("Ahora no",null)
            .setPositiveButton("Activar huella",(dialog,which)->saveBiometric()).show();
    }

    private void saveBiometric(){
        if(staffRefreshToken==null){message("Ingresá primero con tu celular y contraseña.");return;}
        BiometricVault.save(this,staffRefreshToken,(saved,detail)->message(detail));
    }

    private void biometricLogin(){
        BiometricVault.unlock(this,(refresh,error)->{
            if(refresh==null){if(error!=null)message(error);return;}
            JSONObject payload=new JSONObject();
            try{payload.put("refreshToken",refresh);}catch(Exception ignored){}
            signInPending();
            api("POST","/api/staff/refresh",payload,(status,body,err)->{
                if(status==200){
                    try{
                        JSONObject data=new JSONObject(body);
                        JSONObject user=data.getJSONObject("user");
                        staffToken=data.getString("token");
                        staffRefreshToken=refresh;
                        operatorKey=null;
                        staffRole=user.getString("role");
                        staffUserId=user.optString("id","");
                        JSONObject capabilities=user.optJSONObject("capabilities");
                        canManageRoles="admin".equals(staffRole)&&capabilities!=null&&
                            capabilities.optBoolean("manageTeam",false);
                        staffName=user.optString("name","");
                        tab="admin".equals(staffRole)?"administrar":"viajes";
                        adminLoaded=false;
                        fetchBookings(true);
                    }catch(Exception e){loginScreen();message("No se pudo abrir la sesión.");}
                }else{
                    BiometricVault.clear(this);
                    loginScreen();
                    new AlertDialog.Builder(this)
                        .setTitle("Reingreso necesario")
                        .setMessage("La sesión biométrica venció o fue revocada. Ingresá con tu celular y contraseña.")
                        .setPositiveButton("Entendido",null).show();
                }
            });
        });
    }

    private void verifyEmailDialog(String address) {
        LinearLayout page = authPage("PASO 02  /  02", "Confirmá tu correo",
            "Ingresá el código de seis cifras que enviamos a " + address +
            ". Podés seguir trabajando mientras llega.");
        LinearLayout notice = row();
        notice.setPadding(dp(12), dp(12), dp(12), dp(12));
        notice.setBackground(bg(SOFT, 12, 0));
        TextView note = text("✉   Código válido durante 10 minutos", 12, TEAL_DARK, false);
        notice.addView(note);
        page.addView(notice, new LinearLayout.LayoutParams(-1, -2));
        spacer(page, 27);
        EditText code = authField(page, "CÓDIGO DE VERIFICACIÓN", "·  ·  ·  ·  ·  ·",
            InputType.TYPE_CLASS_NUMBER, false);
        code.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(6)});
        code.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_DONE);
        Button check = button("Confirmar correo  →", true, null);
        check.setTextSize(15);
        page.addView(check, new LinearLayout.LayoutParams(-1, dp(52)));
        LinearLayout wait = authWaiting(page);
        TextView error = authError(page);

        check.setOnClickListener(v -> {
            String digits = code.getText().toString().trim();
            if (!digits.matches("[0-9]{6}")) {
                authErrorText(error, "Ingresá las seis cifras del correo.");
                return;
            }
            authErrorText(error, "");
            authBusy(wait, check, true, "Verificando tu código de forma segura…");
            JSONObject p = new JSONObject();
            try { p.put("email", address); p.put("code", digits); } catch(Exception ignored) {}
            api("POST", "/api/staff/verify-email", p, (status, body, reason) -> {
                authBusy(wait, check, false, "");
                if (status == 200) {
                    try {
                        JSONObject response = new JSONObject(body);
                        accountResult(response.optBoolean("accountReady", false),
                            response.optString("role", "driver"));
                    } catch(Exception ignored) { accountResult(false, "driver"); }
                } else {
                    code.setText("");
                    authErrorText(error, reason.isEmpty() ?
                        "El código no es válido o venció. Probá otra vez." : reason);
                }
            });
        });
        code.setOnEditorActionListener((v, actionId, event) -> {
            if(actionId == android.view.inputmethod.EditorInfo.IME_ACTION_DONE) {
                check.performClick(); return true;
            }
            return false;
        });
        spacer(page, 19);
        LinearLayout links = row();
        TextView resend = actionText("Reenviar código", TEAL_DARK, v -> {
            authErrorText(error, "");
            resendCode(address, wait, check, error);
        });
        links.addView(resend, new LinearLayout.LayoutParams(0, dp(46), 1));
        TextView later = actionText("Más tarde", MUTED, v -> loginScreen());
        links.addView(later, new LinearLayout.LayoutParams(0, dp(46), 1));
        page.addView(links);
        spacer(page, 12);
        addLine(page, "Revisá también la carpeta de spam. No compartas el código con nadie.",
            12, MUTED, false, 0);
    }

    private void resendCode(String address, LinearLayout wait, Button button, TextView error) {
        authBusy(wait, button, true, "Solicitando otro código…");
        JSONObject p = new JSONObject();
        try { p.put("email", address); } catch(Exception ignored) {}
        api("POST", "/api/staff/resend-email", p, (status, body, reason) -> {
            authBusy(wait, button, false, "");
            if(status == 200) {
                try {
                    int seconds = new JSONObject(body).optInt("waitSeconds", 0);
                    authErrorText(error, seconds > 0 ?
                        "Ya se solicitó un código. Podés volver a intentarlo en " + seconds + " segundos." :
                        "Solicitud recibida. Si tu correo sigue pendiente, llegará un código.");
                } catch(Exception ignored) {
                    authErrorText(error, "Solicitud recibida. Revisá el correo.");
                }
            } else authErrorText(error, reason.isEmpty() ?
                "No pudimos solicitar otro código. Intentá nuevamente." : reason);
        });
    }

    private void askEmailForVerification() {
        LinearLayout page = authPage("VERIFICACIÓN", "Retomá tu registro",
            "Si ya creaste tu cuenta, ingresá el correo que utilizaste para continuar.");
        EditText email = authField(page, "CORREO ELECTRÓNICO", "nombre@correo.com",
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, false);
        Button go = button("Continuar  →", true, v -> {
            String address = email.getText().toString().trim();
            if(address.contains("@") && address.contains("."))verifyEmailDialog(address);
            else message("Ingresá un correo electrónico válido.");
        });
        page.addView(go, new LinearLayout.LayoutParams(-1, dp(52)));
    }


    private void passwordResetStart(String previousPhone) {
        LinearLayout page = authPage("RECUPERAR ACCESO", "Tu contraseña",
            "Ingresá el celular con el que te registraste. Si tu cuenta tiene el correo confirmado, enviaremos allí un código de recuperación.");
        EditText phone = authField(page,"CELULAR","099 123 456",
            InputType.TYPE_CLASS_PHONE,false);
        phone.setText(previousPhone == null || previousPhone.trim().isEmpty() ?
            getSharedPreferences("via_preferences", MODE_PRIVATE).getString("last_phone", "") :
            previousPhone.trim());
        Button send = button("Enviar código  →",true,null);
        page.addView(send,new LinearLayout.LayoutParams(-1,dp(52)));
        LinearLayout wait = authWaiting(page);
        TextView error = authError(page);
        spacer(page,16);
        addLine(page, "Por seguridad, no indicamos si un celular está registrado. El código solamente llega al correo ya verificado.",
            12,MUTED,false,0);
        send.setOnClickListener(v->{
            String number=phone.getText().toString().trim();
            if(number.replaceAll("[^0-9]","").length()<9){
                authErrorText(error,"Ingresá un celular válido.");
                return;
            }
            authErrorText(error,"");
            authBusy(wait,send,true,"Preparando tu recuperación de forma segura…");
            JSONObject p=new JSONObject();
            try{p.put("phone",number);}catch(Exception ignored){}
            api("POST","/api/staff/password-reset/request",p,(status,body,reason)->{
                authBusy(wait,send,false,"");
                if(status==200){
                    getSharedPreferences("via_preferences", MODE_PRIVATE)
                        .edit().putString("last_phone",number).apply();
                    passwordResetConfirm(number);
                }else authErrorText(error,reason.isEmpty()?
                    "No pudimos solicitar el código. Intentá nuevamente." : reason);
            });
        });
    }

    private void passwordResetConfirm(String phone) {
        LinearLayout page=authPage("RECUPERAR ACCESO  /  02", "Creá una contraseña",
            "Si tu correo estaba verificado, recibirás un código de seis cifras. Ingresalo junto con tu nueva contraseña.");
        EditText code=authField(page,"CÓDIGO DE SEIS CIFRAS","·  ·  ·  ·  ·  ·",
            InputType.TYPE_CLASS_NUMBER,false);
        code.setFilters(new android.text.InputFilter[]{
            new android.text.InputFilter.LengthFilter(6)});
        EditText pass=authField(page,"NUEVA CONTRASEÑA","Mínimo 12 caracteres",
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD,true);
        EditText repeat=authField(page,"REPETIR CONTRASEÑA","Repetí la contraseña",
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD,true);
        Button update=button("Guardar contraseña  →",true,null);
        page.addView(update,new LinearLayout.LayoutParams(-1,dp(52)));
        LinearLayout wait=authWaiting(page);
        TextView error=authError(page);
        spacer(page,13);
        addLine(page,"El código vence en 10 minutos y solo puede usarse una vez. Revisá spam si no encontrás el correo.",
            12,MUTED,false,11);
        TextView resend=actionText("Solicitar otro código",TEAL_DARK,v->
            passwordResetStart(phone));
        page.addView(resend);
        update.setOnClickListener(v->{
            String digits=code.getText().toString().trim();
            String password=pass.getText().toString();
            if(!digits.matches("[0-9]{6}")){
                authErrorText(error,"Ingresá las seis cifras que recibiste.");
                return;
            }
            if(password.length()<12||password.length()>128){
                authErrorText(error,"Usá una contraseña de 12 a 128 caracteres.");
                return;
            }
            if(!password.equals(repeat.getText().toString())){
                authErrorText(error,"Las contraseñas no coinciden.");
                return;
            }
            authErrorText(error,"");
            authBusy(wait,update,true,"Guardando tu contraseña de forma segura…");
            JSONObject p=new JSONObject();
            try{
                p.put("phone",phone);
                p.put("code",digits);
                p.put("newPassword",password);
            }catch(Exception ignored){}
            api("POST","/api/staff/password-reset/confirm",p,(status,body,reason)->{
                authBusy(wait,update,false,"");
                pass.setText("");repeat.setText("");code.setText("");
                if(status==200){
                    BiometricVault.clear(this);
                    LinearLayout done=authPage("ACCESO RESTABLECIDO","Todo pronto.",
                        "Tu contraseña fue actualizada. Ya podés ingresar con tu celular y la nueva clave.");
                    LinearLayout success=card();
                    addLine(success,"✓  Contraseña cambiada",17,TEAL_DARK,true,8);
                    addLine(success,"Las sesiones anteriores se cerraron para proteger tu cuenta.",
                        13,MUTED,false,0);
                    appendCard(done,success,18);
                    done.addView(button("Ir a ingresar  →",true,x->loginScreen()),
                        new LinearLayout.LayoutParams(-1,dp(52)));
                } else authErrorText(error,reason.isEmpty()?
                    "El código es inválido o venció. Solicitá uno nuevo." : reason);
            });
        });
    }

    private void driverRegister() {
        LinearLayout page = authPage("PASO 01  /  02", "Creá tu cuenta",
            "Un registro simple, con tus datos personales. Después verificás tu correo para activar el acceso.");
        EditText name = authField(page, "NOMBRE Y APELLIDO", "Tu nombre completo",
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS, false);
        EditText phone = authField(page, "CELULAR", "099 123 456", InputType.TYPE_CLASS_PHONE, false);
        phone.setText(getSharedPreferences("via_preferences", MODE_PRIVATE).getString("last_phone", ""));
        EditText email = authField(page, "CORREO ELECTRÓNICO", "nombre@correo.com",
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, false);
        EditText password = authField(page, "CONTRASEÑA", "Mínimo 12 caracteres",
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD, true);
        password.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_DONE);
        spacer(page, 2);
        Button submit = button("Crear cuenta  →", true, null);
        submit.setTextSize(15);
        page.addView(submit, new LinearLayout.LayoutParams(-1, dp(52)));
        LinearLayout wait = authWaiting(page);
        TextView error = authError(page);
        spacer(page, 14);
        addLine(page, "Tus datos se transmiten de forma segura. La cuenta solo se activa después de verificar el correo.",
            12, MUTED, false, 0);
        submit.setOnClickListener(v -> {
            String fullName=name.getText().toString().trim();
            String number=phone.getText().toString().trim();
            String address=email.getText().toString().trim();
            String secret=password.getText().toString();
            if(fullName.length()<3) { authErrorText(error,"Ingresá tu nombre completo."); return; }
            if(number.replaceAll("[^0-9]","").length()<9) {
                authErrorText(error,"Revisá el número de celular."); return;
            }
            if(!address.contains("@")||!address.contains(".")) {
                authErrorText(error,"Ingresá un correo válido."); return;
            }
            if(secret.length()<12) {
                authErrorText(error,"La contraseña debe tener al menos 12 caracteres."); return;
            }
            authErrorText(error, "");
            authBusy(wait, submit, true, "Creando tu cuenta y preparando el correo…");
            JSONObject p = new JSONObject();
            try {
                p.put("name", fullName);
                p.put("phone", number);
                p.put("email", address);
                p.put("password", secret);
            } catch(Exception ignored) {}
            api("POST", "/api/staff/register-phone", p, (status, body, reason) -> {
                authBusy(wait, submit, false, "");
                if(status == 201) {
                    getSharedPreferences("via_preferences", MODE_PRIVATE)
                        .edit().putString("last_phone",number).apply();
                    password.setText("");
                    verifyEmailDialog(address);
                    try {
                        if(!new JSONObject(body).optBoolean("emailSent", false))
                            message("La cuenta se creó, pero el correo no salió. Usá «Reenviar código».");
                    } catch(Exception ignored) {}
                } else {
                    authErrorText(error, reason.isEmpty() ?
                        "No pudimos completar el registro. Revisá los datos." : reason);
                }
            });
        });
        password.setOnEditorActionListener((v, actionId, event) -> {
            if(actionId == android.view.inputmethod.EditorInfo.IME_ACTION_DONE) {
                submit.performClick();return true;
            }
            return false;
        });
    }

    private void bootstrapAdmin() {
        if(operatorKey==null){message("Se requiere la clave maestra.");return;}
        LinearLayout form=formContainer();
        EditText name=formInput(form,"Nombre y apellido del administrador",
            InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        EditText phone=formInput(form,"Celular del administrador",InputType.TYPE_CLASS_PHONE);
        EditText email=formInput(form,"Correo del administrador",
            InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText password=formInput(form,"Contraseña propia, mínimo 12 caracteres",
            InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
        new AlertDialog.Builder(this).setTitle("Crear administrador principal")
            .setMessage("La cuenta requerirá validar el correo, pero después ingresarás usando tu celular y contraseña.")
            .setView(form)
            .setNegativeButton("Cancelar",null)
            .setPositiveButton("Crear administrador",(d,w)->{
                String address=email.getText().toString().trim();
                JSONObject p=new JSONObject();
                try{
                    p.put("name",name.getText().toString().trim());
                    p.put("phone",phone.getText().toString().trim());
                    p.put("email",address);
                    p.put("password",password.getText().toString());
                }catch(Exception ignored){}
                password.setText("");
                api("POST","/api/admin/bootstrap-phone",p,(status,body,error)->{
                    if(status==201){
                        message("Administrador creado. Ahora verificá tu correo.");
                        verifyEmailDialog(address);
                    }else new AlertDialog.Builder(this)
                        .setTitle("No se pudo crear")
                        .setMessage(error.isEmpty()?"Revisá los datos":error)
                        .setPositiveButton("Entendido",null).show();
                });
            }).show();
    }

    private void linkExistingAdmin(){
        if(operatorKey==null){message("Ingresá primero con la clave maestra.");return;}
        LinearLayout form=formContainer();
        EditText phone=formInput(form,"Tu número de celular",InputType.TYPE_CLASS_PHONE);
        EditText email=formInput(form,"Correo del administrador ya registrado",
            InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        new AlertDialog.Builder(this).setTitle("Vincular celular a mi cuenta")
            .setMessage("Para el administrador creado con la versión anterior. Mantendrás la misma contraseña y confirmarás el correo.")
            .setView(form)
            .setNegativeButton("Cancelar",null)
            .setPositiveButton("Vincular",(d,w)->{
                String address=email.getText().toString().trim();
                JSONObject p=new JSONObject();
                try{
                    p.put("email",address);
                    p.put("phone",phone.getText().toString().trim());
                }catch(Exception ignored){}
                api("POST","/api/admin/link-phone",p,(status,body,error)->{
                    if(status==200){
                        try{
                            if(new JSONObject(body).optBoolean("emailVerificationRequired",false))
                                verifyEmailDialog(address);
                            else message("El celular ya estaba vinculado.");
                        }catch(Exception e){verifyEmailDialog(address);}
                    }else new AlertDialog.Builder(this).setTitle("No se pudo vincular")
                        .setMessage(error.isEmpty()?"Revisá los datos":error)
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
                    // La lista de administradores solamente se solicita si el
                    // servidor autorizó expresamente esa capacidad en la sesión.
                    managedAdmins = new JSONArray();
                    if(staffToken == null || !canManageRoles) {
                        adminLoaded = true;
                        if ("administrar".equals(tab)) dashboard();
                    } else api("GET", "/api/admin/team", null, (teamStatus, teamResult, teamError) -> {
                        if(teamStatus == 200) {
                            try {
                                JSONObject dataTeam = new JSONObject(teamResult);
                                managedAdmins = dataTeam.getJSONArray("admins");
                                canManageRoles = dataTeam.optBoolean("canManageRoles", false);
                            } catch(Exception ignored) { canManageRoles = false; }
                        }
                        adminLoaded = true;
                        if("administrar".equals(tab)) dashboard();
                    });
                } catch (Exception e) { message("Configuración inválida"); }
            });
        });
    }

    private void manage(LinearLayout content) {
        if(!"admin".equals(staffRole)){
            addLine(content,"Acceso restringido",19,ORANGE,true,0);
            return;
        }
        addLine(content,"Gestión de traslados",25,INK,true,4);
        addLine(content,"Servicio, conductores y autorizaciones",13,MUTED,false,19);
        if(!adminLoaded){
            LinearLayout loading=card();
            addLine(loading,"Consultando estado del servicio…",14,MUTED,false,0);
            appendCard(content,loading,15);
            loadAdmin();
            return;
        }

        int pending=0,approved=0,blocked=0;
        for(int i=0;i<managedDrivers.length();i++){
            JSONObject d=managedDrivers.optJSONObject(i);
            if(d==null)continue;
            String status=d.optString("status");
            if("pending".equals(status))pending++;
            else if("approved".equals(status))approved++;
            else blocked++;
        }
        LinearLayout stats=row();
        stats.addView(statTile(String.valueOf(pending),"Por aprobar",pending>0),
            new LinearLayout.LayoutParams(0,-2,1));
        LinearLayout.LayoutParams second=new LinearLayout.LayoutParams(0,-2,1);
        second.leftMargin=dp(8);
        stats.addView(statTile(String.valueOf(approved),"Habilitados",false),second);
        content.addView(stats);
        spacer(content,18);

        LinearLayout service=card();
        LinearLayout header=row();
        TextView label=text("WEB DE PASAJEROS",12,MUTED,true);
        label.setLetterSpacing(0.08f);
        header.addView(label,new LinearLayout.LayoutParams(0,-2,1));
        TextView pill=text(siteEnabled?"ACTIVA":"SUSPENDIDA",11,
            siteEnabled?TEAL_DARK:ORANGE,true);
        pill.setPadding(dp(10),dp(6),dp(10),dp(6));
        pill.setBackground(bg(siteEnabled?SOFT:Color.rgb(255,245,234),15,0));
        header.addView(pill);
        service.addView(header);
        spacer(service,13);
        addLine(service,siteEnabled?"Servicio habilitado":"Servicio suspendido",
            19,INK,true,5);
        addLine(service,siteEnabled?
            "Los pasajeros pueden consultar y solicitar traslados.":
            "Las solicitudes nuevas están detenidas. Podés reactivar el servicio desde aquí.",
            13,MUTED,false,15);
        Button toggle=button(siteEnabled?"Suspender solicitudes":"Reactivar servicio",
            !siteEnabled,v->confirmServiceSwitch());
        service.addView(toggle,new LinearLayout.LayoutParams(-1,dp(46)));
        appendCard(content,service,24);

        LinearLayout headerDrivers=row();
        TextView title=text("Conductores",21,INK,true);
        headerDrivers.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        TextView counts=text(managedDrivers.length()+" registrados",12,MUTED,false);
        headerDrivers.addView(counts);
        content.addView(headerDrivers);
        spacer(content,11);
        if(managedDrivers.length()==0){
            LinearLayout empty=card();
            addLine(empty,"Todavía no hay conductores",16,INK,true,5);
            addLine(empty,"Las solicitudes de registro aparecerán acá para que las apruebes.",
                13,MUTED,false,0);
            appendCard(content,empty,13);
        }
        for(int i=0;i<managedDrivers.length();i++){
            JSONObject driver=managedDrivers.optJSONObject(i);
            if(driver==null)continue;
            String id=driver.optString("id"),status=driver.optString("status");
            boolean verified=driver.optBoolean("emailVerified",false);
            LinearLayout c=card();
            LinearLayout upper=row();
            TextView name=text(driver.optString("name","Sin nombre"),16,INK,true);
            upper.addView(name,new LinearLayout.LayoutParams(0,-2,1));
            TextView statusTag=text("pending".equals(status)?"PENDIENTE":
                "approved".equals(status)?"ACTIVO":"BLOQUEADO",11,
                "approved".equals(status)?TEAL_DARK:ORANGE,true);
            statusTag.setPadding(dp(7),dp(5),dp(7),dp(5));
            statusTag.setBackground(bg("approved".equals(status)?SOFT:
                Color.rgb(255,245,234),12,0));
            upper.addView(statusTag);
            c.addView(upper);
            spacer(c,8);
            addLine(c,driver.optString("phone","Sin celular"),13,INK,false,3);
            addLine(c,driver.optString("email",""),12,MUTED,false,5);
            JSONObject vehicle=driver.optJSONObject("vehicle");
            if(vehicle!=null&&!vehicle.optString("plate","").isEmpty()&&
                !"null".equals(vehicle.optString("plate"))){
                addLine(c,vehicle.optString("make","")+" "+vehicle.optString("model","")+
                    " · "+vehicle.optString("plate"),12,TEAL_DARK,true,8);
            }else addLine(c,"Vehículo sin registrar",12,MUTED,false,8);
            addLine(c,verified?"✓ Correo verificado":"• Correo pendiente de verificación",
                12,verified?TEAL:ORANGE,false,13);
            String target="approved".equals(status)?"blocked":"approved";
            String action="approved".equals(status)?"Bloquear acceso":"Aprobar conductor";
            Button control=button(action,!"approved".equals(status),
                v->confirmDriverStatus(id,driver.optString("name"),target));
            if("approved".equals(target)&&!verified){
                control.setEnabled(false);
                control.setAlpha(0.45f);
            }
            c.addView(control,new LinearLayout.LayoutParams(-1,dp(44)));
            if(canManageRoles && "approved".equals(status) && verified) {
                spacer(c,8);
                Button delegate=button("Nombrar administrador",false,
                    v->confirmTeamRole(id,driver.optString("name"),"admin"));
                c.addView(delegate,new LinearLayout.LayoutParams(-1,dp(44)));
            }
            if("approved".equals(status)){
                spacer(c,8);
                c.addView(button("Editar vehículo y capacidad",false,
                    v->editDriverVehicle(driver)),new LinearLayout.LayoutParams(-1,dp(44)));
            }
            appendCard(content,c,10);
        }
        if(canManageRoles) {
            LinearLayout commercial=card();
            addLine(commercial,"DESPACHO Y TARIFAS",11,TEAL_DARK,true,8);
            addLine(commercial,"Modalidades privadas y permisos de cotización",
                15,INK,true,7);
            addLine(commercial,"Solo el administrador fundador puede ver y cambiar "+
                "las condiciones comerciales de cada conductor.",12,MUTED,false,12);
            commercial.addView(button("Socios, contratados y permisos",false,
                v->openCommercialDashboard()),new LinearLayout.LayoutParams(-1,dp(44)));
            spacer(commercial,8);
            commercial.addView(button("Parámetros de precios sugeridos",false,
                v->openPricingSettings()),new LinearLayout.LayoutParams(-1,dp(44)));
            spacer(commercial,8);
            commercial.addView(button("Comisiones devengadas y liquidaciones",false,
                v->openCommissionLedger()),new LinearLayout.LayoutParams(-1,dp(44)));
            appendCard(content,commercial,13);
            spacer(content,18);
            addLine(content,"Administradores",21,INK,true,5);
            addLine(content,"Vos decidís quién puede administrar el servicio.",
                13,MUTED,false,15);
            for(int i=0;i<managedAdmins.length();i++) {
                JSONObject admin=managedAdmins.optJSONObject(i);
                if(admin==null)continue;
                LinearLayout a=card();
                String id=admin.optString("id");
                boolean founder=id.equals(staffUserId);
                addLine(a,admin.optString("name","Administrador"),16,INK,true,5);
                addLine(a,admin.optString("phone",""),13,MUTED,false,4);
                addLine(a,founder?"Cuenta fundadora":"Administrador autorizado",
                    12,TEAL_DARK,false,9);
                if(!founder){
                    a.addView(button("Retirar permiso de administración",false,
                        v->confirmTeamRole(id,admin.optString("name"),"driver")),
                        new LinearLayout.LayoutParams(-1,dp(44)));
                }
                appendCard(content,a,9);
            }
        }
        spacer(content,5);
        addLine(content,"Los conductores bloqueados pierden acceso a sus viajes y a las sesiones con huella.",
            12,MUTED,false,13);
    }

    // Modalidad comercial visible exclusivamente al administrador fundador.
    private void openCommercialDashboard() {
        if(!canManageRoles||staffToken==null)return;
        LinearLayout[] sections=new LinearLayout[2];
        Dialog panel=premiumPage("CONFIGURACIÓN PRIVADA","Modelo de conductores",
            "Solo administrador fundador","Permisos",sections);
        LinearLayout body=sections[0];
        addLine(body,"Definí quién puede cotizar solicitudes nuevas y quién puede liberarlas. "+
            "Esta clasificación no aparece en las cuentas de conductores.",13,MUTED,false,12);
        LinearLayout list=column();
        body.addView(list);
        addLine(list,"Consultando perfiles comerciales…",13,MUTED,false,0);
        api("GET","/api/admin/commercial-drivers",null,(status,result,error)->{
            if(!panel.isShowing())return;
            list.removeAllViews();
            if(status!=200){
                addLine(list,error.isEmpty()?"No se pudieron cargar las condiciones.":error,
                    13,ORANGE,false,0);
                return;
            }
            try{
                JSONArray rows=new JSONObject(result).getJSONArray("drivers");
                for(int i=0;i<rows.length();i++){
                    JSONObject driver=rows.optJSONObject(i);
                    if(driver==null)continue;
                    LinearLayout card=card();
                    addLine(card,driver.optString("name","Conductor"),15,INK,true,5);
                    addLine(card,"partner".equals(driver.optString("mode"))?"Socio":"Contratado",
                        12,TEAL_DARK,true,5);
                    addLine(card,"Cotización general: "+
                        (driver.optBoolean("canQuoteAll")?"habilitada":"no habilitada")+
                        " · Liberación: "+(driver.optBoolean("canRelease")?"sí":"no"),
                        11,MUTED,false,10);
                    card.addView(button("Editar permisos y comisión",false,v->{
                        panel.dismiss();
                        editCommercialDriver(driver);
                    }),new LinearLayout.LayoutParams(-1,dp(44)));
                    appendCard(list,card,10);
                }
                if(rows.length()==0)addLine(list,"No hay conductores registrados.",13,MUTED,false,0);
            }catch(Exception ex){
                addLine(list,"Respuesta comercial inválida.",13,ORANGE,false,0);
            }
        });
    }

    private void editCommercialDriver(JSONObject driver) {
        if(!canManageRoles||staffToken==null)return;
        LinearLayout[] sections=new LinearLayout[2];
        Dialog panel=premiumPage("ÚNICAMENTE ADMINISTRACIÓN","Permisos comerciales",
            driver.optString("name","Conductor"),"Privado",sections);
        LinearLayout body=sections[0],footer=sections[1];
        addLine(body,"MODALIDAD INTERNA",10,TEAL_DARK,true,12);
        android.widget.RadioGroup options=new android.widget.RadioGroup(this);
        options.setOrientation(android.widget.RadioGroup.VERTICAL);
        android.widget.RadioButton partner=new android.widget.RadioButton(this);
        partner.setId(View.generateViewId());partner.setText("Socio · sin comisión");
        partner.setTextSize(14);partner.setTextColor(INK);
        android.widget.RadioButton contractor=new android.widget.RadioButton(this);
        contractor.setId(View.generateViewId());contractor.setText("Contratado · comisión");
        contractor.setTextSize(14);contractor.setTextColor(INK);
        options.addView(partner);
        options.addView(contractor);
        options.check("partner".equals(driver.optString("mode"))?
            partner.getId():contractor.getId());
        body.addView(options);
        spacer(body,12);
        android.widget.CheckBox quoteAll=new android.widget.CheckBox(this);
        quoteAll.setText("Puede ver y cotizar solicitudes generales");
        quoteAll.setTextColor(INK);
        quoteAll.setTextSize(13);
        quoteAll.setChecked(driver.optBoolean("canQuoteAll",false));
        body.addView(quoteAll);
        android.widget.CheckBox release=new android.widget.CheckBox(this);
        release.setText("Puede liberar solicitudes a contratados");
        release.setTextColor(INK);
        release.setTextSize(13);
        release.setChecked(driver.optBoolean("canRelease",false));
        body.addView(release);
        spacer(body,12);
        addLine(body,"COMISIÓN % SOBRE LA COTIZACIÓN",10,MUTED,true,7);
        EditText fee=new EditText(this);
        fee.setSingleLine(true);fee.setTextSize(17);
        fee.setInputType(InputType.TYPE_CLASS_NUMBER);
        fee.setText(String.valueOf(driver.optInt("commissionBps",2500)/100));
        fee.setBackground(bg(Color.WHITE,12,BORDER));
        fee.setPadding(dp(12),dp(8),dp(12),dp(8));
        body.addView(fee,new LinearLayout.LayoutParams(-1,dp(48)));
        TextView note=text("Ejemplo contratado: cotización $ 4.000 · "+
            "comisión 25% = $ 1.000 · conductor recibe $ 3.000.",12,MUTED,false);
        body.addView(note);
        options.setOnCheckedChangeListener((group,checkedId)->{
            boolean isPartner=checkedId==partner.getId();
            release.setEnabled(isPartner);
            if(!isPartner)release.setChecked(false);
            fee.setEnabled(!isPartner);
            if(isPartner)fee.setText("0");
            else if("0".equals(fee.getText().toString()))fee.setText("25");
        });
        boolean initialPartner=options.getCheckedRadioButtonId()==partner.getId();
        release.setEnabled(initialPartner);
        fee.setEnabled(!initialPartner);
        TextView error=text("",12,ORANGE,false);
        footer.addView(error);
        Button save=button("Guardar permisos",true,null);
        footer.addView(save,new LinearLayout.LayoutParams(-1,dp(46)));
        save.setOnClickListener(v->{
            try{
                boolean isPartner=options.getCheckedRadioButtonId()==partner.getId();
                int bps=Integer.parseInt(fee.getText().toString().trim())*100;
                JSONObject patch=new JSONObject()
                    .put("mode",isPartner?"partner":"contractor")
                    .put("canQuoteAll",quoteAll.isChecked())
                    .put("canRelease",isPartner&&release.isChecked())
                    .put("commissionBps",isPartner?0:bps);
                save.setEnabled(false);
                api("PATCH","/api/admin/drivers/"+
                    Uri.encode(driver.optString("id"))+"/commercial",patch,(status,result,problem)->{
                    if(status==200){
                        panel.dismiss();
                        message("Permisos comerciales actualizados.");
                        openCommercialDashboard();
                    }else{
                        error.setText(problem.isEmpty()?"No se pudieron guardar los cambios.":problem);
                        save.setEnabled(true);
                    }
                });
            }catch(Exception ex){error.setText("Ingresá una comisión válida entre 0 y 50%.");}
        });
    }

    private void openCommissionLedger(){
        if(!canManageRoles||staffToken==null)return;
        LinearLayout[] sections=new LinearLayout[2];
        Dialog panel=premiumPage("SOLO ADMINISTRACIÓN","Comisiones",
            "Viajes completados · pesos uruguayos","Interno",sections);
        LinearLayout body=sections[0];
        addLine(body,"Las comisiones se registran al completar los viajes. "+
            "Marcar una liquidación no realiza transferencias ni cobros automáticos.",
            12,MUTED,false,12);
        LinearLayout list=column();
        body.addView(list);
        addLine(list,"Consultando liquidaciones…",13,MUTED,false,0);
        api("GET","/api/admin/commissions",null,(status,result,error)->{
            if(!panel.isShowing())return;
            list.removeAllViews();
            if(status!=200){
                addLine(list,error.isEmpty()?"Sin acceso al registro de comisiones.":error,
                    13,ORANGE,false,0);
                return;
            }
            try{
                JSONArray entries=new JSONObject(result).getJSONArray("items");
                double total=0;
                for(int i=0;i<entries.length();i++){
                    JSONObject entry=entries.optJSONObject(i);
                    if(entry==null)continue;
                    String state=entry.optString("paymentStatus");
                    if("pending".equals(state))total+=entry.optDouble("commissionUyu",0);
                }
                addLine(list,"Pendiente: $ "+String.format(new java.util.Locale("es","UY"),
                    "%,.2f",total)+" UYU",18,TEAL_DARK,true,14);
                for(int i=0;i<entries.length();i++){
                    JSONObject entry=entries.optJSONObject(i);
                    if(entry==null)continue;
                    LinearLayout tile=card();
                    addLine(tile,entry.optString("driverName","Conductor"),
                        15,INK,true,5);
                    addLine(tile,entry.optString("bookingId",""),11,MUTED,false,8);
                    addLine(tile,"Comisión: $ "+String.format(
                        new java.util.Locale("es","UY"),"%,.2f",
                        entry.optDouble("commissionUyu",0))+" · "+
                        ("paid".equals(entry.optString("paymentStatus"))?"Pagada":
                          "waived".equals(entry.optString("paymentStatus"))?
                          "Sin comisión":"Pendiente"),
                        13,TEAL_DARK,true,8);
                    if("pending".equals(entry.optString("paymentStatus"))){
                        String id=entry.optString("bookingId","");
                        tile.addView(button("Registrar pago recibido",false,v->
                            confirmCommissionPayment(id,entry.optString("driverName"),panel)),
                            new LinearLayout.LayoutParams(-1,dp(44)));
                    }
                    appendCard(list,tile,9);
                }
                if(entries.length()==0)
                    addLine(list,"No hay viajes completados con comisión registrada.",
                        13,MUTED,false,0);
            }catch(Exception ex){
                addLine(list,"No se pudo leer el registro de comisiones.",13,ORANGE,false,0);
            }
        });
    }

    private void confirmCommissionPayment(String id,String name,Dialog parent){
        LinearLayout form=formContainer();
        EditText reference=formInput(form,"Referencia del pago recibido",
            InputType.TYPE_CLASS_TEXT);
        new AlertDialog.Builder(this)
            .setTitle("Registrar liquidación")
            .setMessage("Confirmá que recibiste la comisión de "+name+
                ". Esta acción únicamente registra el pago; no mueve dinero.")
            .setView(form)
            .setNegativeButton("Volver",null)
            .setPositiveButton("Registrar",(dialog,which)->{
                String ref=reference.getText().toString().trim();
                if(ref.length()<3){message("Ingresá una referencia verificable.");return;}
                try{
                    JSONObject patch=new JSONObject().put("status","paid").put("reference",ref);
                    api("PATCH","/api/admin/commissions/"+Uri.encode(id),patch,
                        (status,result,error)->{
                            if(status==200){
                                parent.dismiss();
                                message("Liquidación registrada.");
                                openCommissionLedger();
                            }else message(error.isEmpty()?"No se pudo registrar el pago.":error);
                        });
                }catch(Exception e){message("No se pudo preparar la liquidación.");}
            }).show();
    }

    private void openPricingSettings(){
        if(!canManageRoles||staffToken==null)return;
        LinearLayout[] sections=new LinearLayout[2];
        Dialog panel=premiumPage("ADMINISTRACIÓN","Guía de tarifas",
            "Parámetros orientativos · pesos uruguayos","Configurar",sections);
        LinearLayout body=sections[0],footer=sections[1];
        addLine(body,"Ajustá los valores que alimentan el rango mínimo, sugerido y máximo. "+
            "No incluye peajes, esperas, estacionamiento ni retornos vacíos.",
            13,MUTED,false,13);
        final String[] keys={"baseUyu","perKmUyu","perMinuteUyu",
            "minTargetUyu","minFloorUyu","lowFactorBps","highFactorBps"};
        final String[] titles={"Base por traslado (UYU)","Por kilómetro (UYU)",
            "Por minuto (UYU)","Precio mínimo sugerido (UYU)",
            "Piso absoluto del rango (UYU)","Banda baja (%)","Banda alta (%)"};
        final int[] defaults={300,25,4,850,650,75,155};
        EditText[] fields=new EditText[keys.length];
        for(int i=0;i<keys.length;i++){
            addLine(body,titles[i],11,TEAL_DARK,true,5);
            EditText field=new EditText(this);
            field.setInputType(InputType.TYPE_CLASS_NUMBER);
            field.setSingleLine(true);field.setTextSize(15);
            field.setText(String.valueOf(defaults[i]));
            field.setBackground(bg(Color.WHITE,12,BORDER));
            field.setPadding(dp(12),dp(8),dp(12),dp(8));
            body.addView(field,new LinearLayout.LayoutParams(-1,dp(45)));
            spacer(body,10);
            fields[i]=field;
        }
        api("GET","/api/admin/pricing",null,(status,data,error)->{
            if(!panel.isShowing())return;
            if(status!=200){message(error.isEmpty()?"Sin acceso a configuración de tarifas":error);return;}
            try{
                JSONObject params=new JSONObject(data).getJSONObject("config");
                for(int i=0;i<keys.length;i++){
                    int n=params.optInt(keys[i],i>=5?defaults[i]*100:defaults[i]);
                    fields[i].setText(String.valueOf(i>=5?n/100:n));
                }
            }catch(Exception ignored){}
        });
        TextView problem=text("",12,ORANGE,false);
        footer.addView(problem);
        Button save=button("Guardar parámetros de tarifa",true,null);
        footer.addView(save,new LinearLayout.LayoutParams(-1,dp(46)));
        save.setOnClickListener(v->{
            try{
                JSONObject config=new JSONObject();
                for(int i=0;i<keys.length;i++){
                    int n=Integer.parseInt(fields[i].getText().toString().trim());
                    config.put(keys[i],i>=5?n*100:n);
                }
                save.setEnabled(false);
                api("PATCH","/api/admin/pricing",config,(status,data,error)->{
                    if(status==200){
                        panel.dismiss();message("Parámetros de precios actualizados.");
                    }else{save.setEnabled(true);problem.setText(error.isEmpty()?
                        "Revisá los valores.":error);}
                });
            }catch(Exception e){problem.setText("Ingresá valores numéricos válidos.");}
        });
    }

    private void confirmTeamRole(String id,String name,String role) {
        if(!canManageRoles||staffToken==null)return;
        boolean promote="admin".equals(role);
        new AlertDialog.Builder(this)
            .setTitle(promote?"Nombrar administrador":"Retirar permiso administrativo")
            .setMessage(promote?
                name+" podrá aprobar conductores y administrar el servicio. ¿Querés habilitarlo?" :
                name+" volverá a ser conductor. Deberá iniciar sesión nuevamente.")
            .setNegativeButton("Cancelar",null)
            .setPositiveButton("Confirmar",(d,w)->{
                JSONObject payload=new JSONObject();
                try{payload.put("role",role);}catch(Exception ignored){}
                api("PATCH","/api/admin/team/"+id+"/role",payload,(status,result,error)->{
                    if(status==200) {
                        message(promote?"Administrador habilitado.":"Permiso retirado.");
                        adminLoaded=false;
                        loadAdmin();
                    }else message(error.isEmpty()?"No fue posible cambiar el permiso":error);
                });
            }).show();
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

    // Selector profesional: solo cuentas reales, sin simular GPS ni disponibilidad.
    private void editDriverVehicle(JSONObject driver){
        if(!"admin".equals(staffRole))return;
        JSONObject vehicle=driver.optJSONObject("vehicle");
        LinearLayout[] views=new LinearLayout[2];
        Dialog dialog=premiumPage("FICHA OPERATIVA","Vehículo del conductor",
            driver.optString("name","Conductor"),"Edición",views);
        LinearLayout body=views[0],footer=views[1];
        addLine(body,"Registrá datos verificados. La capacidad evitará asignar viajes incompatibles.",
            13,MUTED,false,18);
        EditText plate=authField(body,"MATRÍCULA","APP0061",
            InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS,false);
        EditText make=authField(body,"MARCA","Marca del vehículo",InputType.TYPE_CLASS_TEXT,false);
        EditText model=authField(body,"MODELO","Modelo del vehículo",InputType.TYPE_CLASS_TEXT,false);
        EditText seats=authField(body,"CAPACIDAD DE PASAJEROS","Ej.: 4",
            InputType.TYPE_CLASS_NUMBER,false);
        EditText bags=authField(body,"CAPACIDAD DE EQUIPAJE (VALIJAS)","Ej.: 3",
            InputType.TYPE_CLASS_NUMBER,false);
        if(vehicle!=null){
            plate.setText(vehicle.optString("plate","").replace("null",""));
            make.setText(vehicle.optString("make","").replace("null",""));
            model.setText(vehicle.optString("model","").replace("null",""));
            if(!vehicle.isNull("passengerCapacity"))
                seats.setText(vehicle.optString("passengerCapacity",""));
            if(!vehicle.isNull("luggageCapacity"))
                bags.setText(vehicle.optString("luggageCapacity",""));
        }
        TextView error=text("",12,ORANGE,false);
        footer.addView(error);
        Button save=button("Guardar ficha  →",true,null);
        footer.addView(save,new LinearLayout.LayoutParams(-1,dp(46)));
        save.setOnClickListener(v->{
            try{
                JSONObject payload=new JSONObject()
                    .put("plate",plate.getText().toString().trim())
                    .put("make",make.getText().toString().trim())
                    .put("model",model.getText().toString().trim())
                    .put("passengerCapacity",seats.length()==0?JSONObject.NULL:
                        Integer.parseInt(seats.getText().toString()))
                    .put("luggageCapacity",bags.length()==0?JSONObject.NULL:
                        Integer.parseInt(bags.getText().toString()));
                save.setEnabled(false);
                api("PATCH","/api/admin/drivers/"+
                    Uri.encode(driver.optString("id"))+"/vehicle",payload,(status,response,reason)->{
                    if(status==200){
                        dialog.dismiss();
                        message("Ficha del vehículo actualizada.");
                        adminLoaded=false;
                        loadAdmin();
                    }else{
                        save.setEnabled(true);
                        error.setText(reason.isEmpty()?"No se pudo guardar la ficha.":reason);
                    }
                });
            }catch(Exception ex){error.setText("Revisá matrícula y capacidades numéricas.");}
        });
    }

    private void driverAssignmentDialog(JSONObject booking) {
        if(!"admin".equals(staffRole))return;
        LinearLayout[] views=new LinearLayout[2];
        Dialog selection=premiumPage("PASO 1 DE 2","Asignar conductor",
            booking.optString("id"),"Asignación",views);
        LinearLayout body=views[0];
        LinearLayout summary=card();
        addLine(summary,"TRASLADO",10,MUTED,true,8);
        addLine(summary,compactDate(booking.optString("date"))+" · "+
            booking.optString("time"),16,INK,true,8);
        addLine(summary,prettyAddress(booking.optString("origin"))+"  →  "+
            prettyAddress(booking.optString("destination")),13,INK,false,0);
        appendCard(body,summary,14);
        addLine(body,"CONDUCTORES HABILITADOS",11,TEAL_DARK,true,7);
        addLine(body,"La agenda puede detectar cruces de horarios. No hay seguimiento GPS ni presencia en línea en esta versión.",
            12,MUTED,false,13);
        LinearLayout options=column();
        body.addView(options);
        addLine(options,"Consultando conductores y agenda…",14,MUTED,false,0);
        api("GET","/api/admin/requests/"+Uri.encode(booking.optString("id"))+
            "/assignment-options",null,(status,response,error)->{
            if(!selection.isShowing())return;
            options.removeAllViews();
            if(status!=200){
                addLine(options,"No se pudieron cargar los conductores.",16,INK,true,9);
                addLine(options,error.isEmpty()?
                    "El motor de despacho V26 todavía no está activo. La asignación permanece sin cambios.":
                    error,13,ORANGE,false,12);
                options.addView(button("Volver al traslado",false,v->{
                    selection.dismiss();details(booking);
                }),new LinearLayout.LayoutParams(-1,dp(44)));
                return;
            }
            try {
                JSONObject payload=new JSONObject(response);
                if(!payload.optBoolean("assignable",false)){
                    addLine(options,"Este traslado ya no admite asignaciones.",
                        14,ORANGE,true,0);
                    return;
                }
                String currentId=payload.optString("assignedDriverId","");
                if("null".equals(currentId))currentId="";
                final String expected=currentId;
                JSONArray list=payload.getJSONArray("drivers");
                if(list.length()==0){
                    addLine(options,"Todavía no hay conductores habilitados.",
                        15,INK,true,7);
                    addLine(options,"Aprobá un conductor desde Gestión antes de asignar.",
                        12,MUTED,false,0);
                }
                for(int i=0;i<list.length();i++){
                    JSONObject driver=list.optJSONObject(i);
                    if(driver==null)continue;
                    String name=driver.optString("name","Conductor");
                    String id=driver.optString("id","");
                    boolean verified=driver.optBoolean("emailVerified",false);
                    JSONArray problems=driver.optJSONArray("conflicts");
                    boolean conflict=problems!=null&&problems.length()>0;
                    boolean capacityConflict=driver.optBoolean("capacityConflict",false);
                    boolean current=id.equals(expected);
                    LinearLayout tile=card();
                    LinearLayout header=row();
                    TextView driverName=text(name,16,INK,true);
                    header.addView(driverName,new LinearLayout.LayoutParams(0,-2,1));
                    TextView state=text(current?"ASIGNADO":conflict?"CRUCE DE AGENDA":
                        capacityConflict?"CAPACIDAD INSUFICIENTE":
                        verified?"APROBADO":"CORREO PENDIENTE",10,
                        conflict?ORANGE:TEAL_DARK,true);
                    state.setPadding(dp(7),dp(5),dp(7),dp(5));
                    state.setBackground(bg(conflict?Color.rgb(255,244,232):SOFT,12,0));
                    header.addView(state);
                    tile.addView(header);
                    spacer(tile,8);
                    JSONObject vehicle=driver.optJSONObject("vehicle");
                    String plate=vehicle==null?"":vehicle.optString("plate","");
                    String make=vehicle==null?"":vehicle.optString("make","");
                    String model=vehicle==null?"":vehicle.optString("model","");
                    String vehicleLabel=(plate.isEmpty()||"null".equals(plate))?
                        "Vehículo y matrícula: pendiente de registrar":
                        (make+" "+model+" · "+plate).trim();
                    addLine(tile,vehicleLabel,12,MUTED,false,5);
                    String contact=driver.optString("phone","");
                    if(!contact.isEmpty()&&!"null".equals(contact)){
                        addLine(tile,"Celular · "+contact,12,MUTED,false,4);
                    }
                    if(vehicle!=null){
                        int seats=vehicle.optInt("passengerCapacity",-1);
                        int bags=vehicle.optInt("luggageCapacity",-1);
                        if(seats>0&&bags>=0)addLine(tile,
                            "Capacidad: "+seats+" pasajero(s) · "+bags+" valija(s)",
                            11,MUTED,false,6);
                    }
                    addLine(tile,conflict?
                        "El conductor tiene otro servicio en este horario.":
                        capacityConflict?"Capacidad insuficiente para esta reserva.":
                        "Sin cruces conocidos · disponibilidad GPS no verificada",
                        12,(conflict||capacityConflict)?ORANGE:MUTED,false,10);
                    if(conflict){
                        for(int j=0;j<Math.min(2,problems.length());j++){
                            JSONObject clash=problems.optJSONObject(j);
                            if(clash!=null)addLine(tile,
                                "Coincide con "+clash.optString("bookingId","otro traslado")+
                                " · "+clash.optString("date")+" "+clash.optString("time"),
                                11,ORANGE,false,5);
                        }
                    }
                    Button select=button(current?"Conductor actual":
                        conflict?"Horario no disponible":
                        capacityConflict?"Capacidad insuficiente":"Seleccionar  →",
                        !current&&!conflict&&!capacityConflict,
                        v->{selection.dismiss();confirmPremiumAssignment(booking,id,name,expected);});
                    select.setEnabled(!current&&!conflict&&!capacityConflict&&verified);
                    select.setAlpha(select.isEnabled()?1f:.52f);
                    tile.addView(select,new LinearLayout.LayoutParams(-1,dp(43)));
                    appendCard(options,tile,10);
                }
                if(!expected.isEmpty()){
                    TextView unassign=actionText("Quitar conductor asignado",ORANGE,v->{
                        selection.dismiss();
                        confirmPremiumAssignment(booking,null,"Sin conductor",expected);
                    });
                    unassign.setGravity(Gravity.CENTER);
                    options.addView(unassign);
                }
            } catch(Exception ex){
                addLine(options,"Respuesta de asignaciones inválida. No se modificó nada.",
                    13,ORANGE,false,0);
            }
        });
    }

    // Confirmación separada y con control de cambio concurrente en el servidor.
    private void confirmPremiumAssignment(JSONObject booking,String driverId,
            String driverName,String expectedId) {
        LinearLayout[] views=new LinearLayout[2];
        final boolean removing=driverId==null;
        Dialog confirm=premiumPage("PASO 2 DE 2",removing?"Quitar conductor":
            "Confirmar asignación",booking.optString("id"),"Revisar",views);
        LinearLayout body=views[0],footer=views[1];
        addLine(body,removing?"El traslado quedará sin conductor asignado.":
            "Estás por asignar el siguiente conductor:",14,MUTED,false,13);
        LinearLayout card=card();
        addLine(card,"CONDUCTOR",10,TEAL_DARK,true,8);
        addLine(card,driverName,19,INK,true,13);
        View divider=new View(this);divider.setBackgroundColor(BORDER);
        card.addView(divider,new LinearLayout.LayoutParams(-1,dp(1)));
        spacer(card,12);
        premiumKeyValue(card,"FECHA Y HORA",compactDate(booking.optString("date"))+
            " · "+booking.optString("time"),true);
        premiumKeyValue(card,"RECORRIDO",
            prettyAddress(booking.optString("origin"))+" → "+
            prettyAddress(booking.optString("destination")),true);
        addLine(card,"Reserva: "+statusName(booking.optString("status")),
            12,MUTED,false,0);
        appendCard(body,card,14);
        addLine(body,"Asignar un conductor no confirma automáticamente el viaje al pasajero.",
            13,TEAL_DARK,true,9);
        addLine(body,"La disponibilidad en tiempo real no se conoce. El servidor volverá a validar la agenda y los permisos antes de guardar.",
            12,MUTED,false,0);
        TextView errorMsg=text("",12,ORANGE,false);
        footer.addView(errorMsg);
        Button save=button(removing?"Quitar asignación":"Confirmar asignación",true,null);
        footer.addView(save,new LinearLayout.LayoutParams(-1,dp(46)));
        save.setOnClickListener(v->{
            save.setEnabled(false);
            errorMsg.setText("Guardando la asignación…");
            try{
                JSONObject payload=new JSONObject();
                payload.put("driverId",driverId==null?JSONObject.NULL:driverId);
                payload.put("expectedDriverId",
                    expectedId==null||expectedId.isEmpty()?JSONObject.NULL:expectedId);
                api("POST","/api/admin/requests/"+
                    Uri.encode(booking.optString("id"))+"/assign",payload,
                    (status,response,error)->{
                        if(status==200){
                            confirm.dismiss();
                            try{
                                booking.put("assignedDriverId",driverId==null?JSONObject.NULL:driverId);
                                booking.put("assignedDriverName",
                                    driverId==null?JSONObject.NULL:driverName);
                            }catch(Exception ignored){}
                            fetchBookings(true);
                            premiumAssignmentResult(booking,driverName,removing);
                        }else{
                            save.setEnabled(true);
                            errorMsg.setText(error.isEmpty()?
                                "No se guardó: revisá agenda y asignación.":error);
                        }
                    });
            }catch(Exception ex){
                save.setEnabled(true);
                errorMsg.setText("No se pudo preparar la confirmación.");
            }
        });
    }

    private void premiumAssignmentResult(JSONObject booking,String name,boolean removed) {
        LinearLayout[] views=new LinearLayout[2];
        Dialog result=premiumPage("GESTIÓN DE CONDUCTORES",
            removed?"Asignación retirada":"Conductor asignado",
            booking.optString("id"),"Actualizado",views);
        LinearLayout content=views[0],footer=views[1];
        LinearLayout success=card();
        addLine(success,"✓  "+(removed?"Traslado sin conductor":name),
            19,TEAL_DARK,true,13);
        addLine(success,removed?
            "El traslado está pendiente de una nueva asignación.":
            "Asignación registrada. La confirmación del pasajero y el estado del viaje son independientes.",
            13,INK,false,9);
        addLine(success,"Estado del servicio: "+statusName(booking.optString("status")),
            12,MUTED,false,0);
        appendCard(content,success,12);
        footer.addView(button("Volver al detalle",true,v->{
            result.dismiss();details(booking);
        }),new LinearLayout.LayoutParams(-1,dp(46)));
    }

    private void settings(LinearLayout body) {
        addLine(body,"Ajustes",25,INK,true,4);
        if(BuildConfig.VIA_PREVIEW){
            addLine(body,"Entorno de demostración · sin cuentas reales",
                13,MUTED,false,15);
            LinearLayout preview=card();
            addLine(preview,"ADMINISTRADOR FICTICIO",10,TEAL_DARK,true,8);
            addLine(preview,"Centro de operaciones · Vía Traslados",
                16,INK,true,7);
            addLine(preview,"Esta versión trabaja únicamente con viajes y conductores "+
                "simulados. No existe una sesión real ni se puede crear una cuenta "+
                "o activar el acceso biométrico desde esta demo.",
                12,MUTED,false,13);
            preview.addView(button("Volver a solicitudes",true,v->{
                tab="solicitudes";dashboard();
            }),new LinearLayout.LayoutParams(-1,dp(44)));
            appendCard(body,preview,12);
            LinearLayout tip=card();
            addLine(tip,"QUÉ PROBAR",10,TEAL_DARK,true,8);
            addLine(tip,"Cotización → rango de precios → propuesta asignada.",13,INK,false,7);
            addLine(tip,"Gestión → permisos de conductores y comisiones ficticias.",
                13,INK,false,7);
            addLine(tip,"Sin llamadas, cobros, correos ni conexión al servidor.",
                12,MUTED,false,0);
            appendCard(body,tip,12);
            addLine(body,BuildConfig.VIA_LAYOUT_PREVIEW?
                "Versión V30 Demo · Corrección de detalle y ajustes":
                "Versión de demostración · sin producción",
                11,MUTED,false,0);
            return;
        }
        addLine(body,"Cuenta, seguridad y aplicación",13,MUTED,false,19);

        LinearLayout account=card();
        addLine(account,"MI CUENTA",11,MUTED,true,10);
        addLine(account,staffName.isEmpty()?
            ("admin".equals(staffRole)?"Administrador general":"Conductor"):
            staffName,19,INK,true,5);
        addLine(account,"admin".equals(staffRole)?"Acceso: administración":"Acceso: conductor autorizado",
            13,TEAL,true,15);
        if(staffToken!=null && BiometricVault.supported(this)){
            if(BiometricVault.hasSaved(this)){
                addLine(account,"✓ Acceso con huella habilitado",13,TEAL_DARK,true,11);
                account.addView(button("Desactivar acceso con huella",false,v->{
                    BiometricVault.clear(this);
                    message("La huella quedó desactivada en este teléfono.");
                    dashboard();
                }),new LinearLayout.LayoutParams(-1,dp(47)));
            }else{
                addLine(account,"Protegé tu acceso con la huella del teléfono.",13,MUTED,false,12);
                account.addView(button("Activar huella",false,v->saveBiometric()),
                    new LinearLayout.LayoutParams(-1,dp(47)));
            }
            spacer(account,12);
        }
        addLine(account,"La contraseña no se guarda en el dispositivo.",12,MUTED,false,12);
        Button leave=button("Cerrar sesión",false,v->{
            if(staffToken!=null){
                JSONObject payload=new JSONObject();
                try{
                    if(staffRefreshToken!=null)payload.put("refreshToken",staffRefreshToken);
                }catch(Exception ignored){}
                api("POST","/api/staff/logout-device",payload,(status,response,error)->{});
            }
            BiometricVault.clear(this);
            operatorKey=null;
            staffToken=null;
            staffRefreshToken=null;
            bookings=new JSONArray();
            lastPayload="";
            loginScreen();
        });
        account.addView(leave,new LinearLayout.LayoutParams(-1,dp(46)));
        appendCard(body,account,14);

        if("admin".equals(staffRole) && operatorKey!=null){
            LinearLayout bootstrap=card();
            addLine(bootstrap,"CONFIGURAR ADMINISTRADOR",11,MUTED,true,9);
            addLine(bootstrap,"Tu acceso personal",19,INK,true,6);
            addLine(bootstrap,"Creá una cuenta con tu celular, contraseña y correo verificado. La clave maestra quedará solo para recuperación.",
                13,MUTED,false,15);
            bootstrap.addView(button("Crear cuenta personal",true,v->bootstrapAdmin()),
                new LinearLayout.LayoutParams(-1,dp(48)));
            spacer(bootstrap,9);
            bootstrap.addView(button("Ya tengo cuenta · Vincular celular",false,v->linkExistingAdmin()),
                new LinearLayout.LayoutParams(-1,dp(48)));
            appendCard(body,bootstrap,14);
        }

        LinearLayout info=card();
        addLine(info,"INFORMACIÓN",11,MUTED,true,9);
        addLine(info,"Vía Traslados",17,INK,true,7);
        addLine(info,"Versión 0.9.0 · Rutas Geoapify",13,MUTED,false,5);
        addLine(info,"Actualización de viajes: cada 30 segundos",13,MUTED,false,12);
        info.addView(button("Comprobar conexión",false,v->fetchBookings(true)),
            new LinearLayout.LayoutParams(-1,dp(46)));
        appendCard(body,info,13);

        addLine(body,"Vía Traslados funciona de forma independiente de cualquier otra aplicación.",
            11,MUTED,false,5);
    }

    private void navigation() {
        LinearLayout dock = column();
        dock.setBackgroundColor(Color.WHITE);
        View line = new View(this);
        line.setBackgroundColor(BORDER);
        dock.addView(line,new LinearLayout.LayoutParams(-1,dp(1)));

        LinearLayout bar=row();
        bar.setPadding(dp(8),dp(7),dp(8),dp(6));
        boolean admin="admin".equals(staffRole);
        // Navegación por capacidades, sin mostrar detalles del titular de la cuenta.
        String[] titles=admin&&canManageRoles?
            new String[]{"Gestión","Solicitudes","Viajes","Historial","Ajustes"}:
            admin?new String[]{"Solicitudes","Viajes","Gestión","Ajustes"}:
            new String[]{"Mis viajes","Solicitudes","Historial","Ajustes"};
        String[] icons=admin&&canManageRoles?
            new String[]{"◈","☷","▤","◷","⚙"}:
            admin?new String[]{"☷","▤","◈","⚙"}:
            new String[]{"▤","☷","◷","⚙"};
        String[] values=admin&&canManageRoles?
            new String[]{"administrar","solicitudes","viajes","historial","ajustes"}:
            admin?new String[]{"solicitudes","viajes","administrar","ajustes"}:
            new String[]{"viajes","solicitudes","historial","ajustes"};
        for(int i=0;i<titles.length;i++){
            final String next=values[i];
            boolean active=next.equals(tab);
            LinearLayout slot=column();
            slot.setGravity(Gravity.CENTER);
            slot.setBackground(ripple(active?SOFT:Color.WHITE,0,12));
            LinearLayout.LayoutParams sp=new LinearLayout.LayoutParams(0,dp(57),1);
            if(i>0)sp.leftMargin=dp(2);

            TextView icon=text(icons[i],20,active?TEAL_DARK:MUTED,false);
            icon.setGravity(Gravity.CENTER);
            slot.addView(icon);
            spacer(slot,2);
            TextView name=text(titles[i],admin?10:11,active?TEAL_DARK:MUTED,active);
            name.setGravity(Gravity.CENTER);
            name.setSingleLine(true);
            slot.addView(name);
            slot.setContentDescription("Ir a "+titles[i]);
            slot.setClickable(true);
            slot.setFocusable(true);
            slot.setOnClickListener(v->{tab=next;dashboard();});
            bar.addView(slot,sp);
        }
        dock.addView(bar,new LinearLayout.LayoutParams(-1,dp(70)));
        root.addView(dock,new LinearLayout.LayoutParams(-1,-2));
    }

    private void message(String s) { Toast.makeText(this,s,Toast.LENGTH_LONG).show(); }
}
