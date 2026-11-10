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
    private boolean canManageRoles = false;
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
        addLine(status, ready && "admin".equals(role) ?
            "Tu acceso de administrador fundador está activo." :
            ready ? "Ya podés ingresar con tu celular y contraseña." :
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
                    staffName = user.optString("name", "");
                    getSharedPreferences("via_preferences", MODE_PRIVATE)
                        .edit().putString("last_phone", phone.trim()).apply();
                    tab = "solicitudes";
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
        TextView admin = actionText("Acceso administrador", MUTED, v -> adminMasterDialog());
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
        root.removeAllViews();
        root.setBackgroundColor(LIGHT);

        LinearLayout header = row();
        header.setPadding(dp(19), dp(13), dp(19), dp(13));
        header.setBackgroundColor(Color.WHITE);

        TextView emblem = text("V", 21, Color.WHITE, true);
        emblem.setGravity(Gravity.CENTER);
        emblem.setBackground(bg(TEAL, 11, 0));
        header.addView(emblem, new LinearLayout.LayoutParams(dp(39), dp(39)));

        LinearLayout brand = column();
        LinearLayout.LayoutParams bl = new LinearLayout.LayoutParams(0, -2, 1);
        bl.leftMargin = dp(11);
        header.addView(brand, bl);
        addLine(brand, "Vía Traslados", 18, INK, true, 3);
        addLine(brand, "admin".equals(staffRole) ? "Administrador general" : "Mi espacio de conductor",
            12, MUTED, false, 0);

        TextView refresh = actionText("↻", TEAL_DARK, v -> fetchBookings(true));
        refresh.setTextSize(25);
        refresh.setBackground(ripple(SOFT,0,12));
        refresh.setContentDescription("Actualizar solicitudes");
        header.addView(refresh, new LinearLayout.LayoutParams(dp(42), dp(42)));
        root.addView(header,new LinearLayout.LayoutParams(-1,-2));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));

        LinearLayout content = column();
        content.setPadding(dp(19),dp(20),dp(19),dp(12));
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
            addLine(body, "Solicitudes", 25, INK, true, 4);
            addLine(body, "Consultá y respondé a nuevos traslados", 13, MUTED, false, 16);

            LinearLayout stats = row();
            LinearLayout.LayoutParams first=new LinearLayout.LayoutParams(0,-2,1);
            stats.addView(statTile(String.valueOf(count("requested")), "Sin cotizar", true),first);
            LinearLayout.LayoutParams second=new LinearLayout.LayoutParams(0,-2,1);
            second.leftMargin=dp(9);
            stats.addView(statTile(String.valueOf(count("quoted")), "Con oferta", false),second);
            body.addView(stats);
            spacer(body,18);

            LinearLayout filters=row();
            Button newer=button("Nuevas ("+count("requested")+")",
                "nuevas".equals(subtab),v->{subtab="nuevas";dashboard();});
            Button offers=button("Con ofertas ("+count("quoted")+")",
                "ofertas".equals(subtab),v->{subtab="ofertas";dashboard();});
            newer.setTextSize(13);offers.setTextSize(13);
            filters.addView(newer,new LinearLayout.LayoutParams(0,dp(45),1));
            LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(45),1);
            lp.leftMargin=dp(8);filters.addView(offers,lp);
            body.addView(filters);
            spacer(body,17);
        } else if ("viajes".equals(mode)) {
            addLine(body, "Mis viajes", 25, INK, true, 4);
            addLine(body, "Servicios confirmados y en curso", 13, MUTED, false, 18);
        } else {
            addLine(body, "Historial", 25, INK, true, 4);
            addLine(body, "Traslados finalizados y cancelados", 13, MUTED, false, 18);
        }

        int shown=0;
        for(int i=0;i<bookings.length();i++){
            JSONObject item=bookings.optJSONObject(i);
            if(item==null)continue;
            String status=item.optString("status");
            boolean include;
            if("solicitudes".equals(mode))
                include="nuevas".equals(subtab)?"requested".equals(status):"quoted".equals(status);
            else if("historial".equals(mode))
                include="completed".equals(status)||"cancelled".equals(status);
            else
                include="accepted".equals(status)||"confirmed".equals(status)
                    ||"en_route".equals(status)||"arrived".equals(status)||"in_progress".equals(status);
            if(include){bookingCard(body,item);shown++;}
        }
        if(shown==0){
            LinearLayout empty=card();
            TextView circle=text("✓",20,TEAL,true);
            circle.setGravity(Gravity.CENTER);
            circle.setBackground(bg(SOFT,28,0));
            empty.addView(circle,new LinearLayout.LayoutParams(dp(45),dp(45)));
            spacer(empty,11);
            addLine(empty,"Todo al día",18,INK,true,6);
            addLine(empty,"No hay movimientos en esta sección. Las novedades aparecerán automáticamente.",
                13,MUTED,false,0);
            appendCard(body,empty,10);
        }
        spacer(body,4);
        addLine(body,"Se actualiza cada 30 s mientras la app está abierta.",
            11,MUTED,false,0);
    }

    private void bookingCard(LinearLayout parent, JSONObject item) {
        LinearLayout card=card();
        LinearLayout top=row();
        String date=item.optString("date",""),time=item.optString("time","");
        TextView when=text(date+"  ·  "+time,13,INK,true);
        top.addView(when,new LinearLayout.LayoutParams(0,-2,1));
        String status=item.optString("status");
        TextView flag=text(statusName(status),11,stateColor(status),true);
        flag.setGravity(Gravity.CENTER);
        flag.setPadding(dp(9),dp(6),dp(9),dp(6));
        flag.setBackground(bg(SOFT,20,0));
        top.addView(flag);
        card.addView(top);
        spacer(card,14);

        LinearLayout from=row();
        TextView bullet=text("●",13,TEAL,true);
        from.addView(bullet,new LinearLayout.LayoutParams(dp(22),-2));
        TextView origin=text(item.optString("origin"),15,INK,true);
        origin.setMaxLines(2);
        origin.setEllipsize(android.text.TextUtils.TruncateAt.END);
        from.addView(origin,new LinearLayout.LayoutParams(0,-2,1));
        card.addView(from);
        LinearLayout branch=row();
        TextView axis=text("│",14,Color.rgb(155,185,178),false);
        branch.addView(axis,new LinearLayout.LayoutParams(dp(22),-2));
        card.addView(branch);
        LinearLayout to=row();
        TextView target=text("◆",12,TEAL,true);
        to.addView(target,new LinearLayout.LayoutParams(dp(22),-2));
        TextView dest=text(item.optString("destination"),15,INK,true);
        dest.setMaxLines(2);
        dest.setEllipsize(android.text.TextUtils.TruncateAt.END);
        to.addView(dest,new LinearLayout.LayoutParams(0,-2,1));
        card.addView(to);
        spacer(card,13);

        int price=item.optInt("price",0);
        addLine(card,item.optInt("passengers",1)+" pasaj.  ·  "+
            item.optInt("bags",0)+" valijas"+(price>0?"  ·  $ "+price+" UYU":""),
            12,MUTED,false,13);

        LinearLayout actions=row();
        Button see=button("Ver detalles",false,v->details(item));
        actions.addView(see,new LinearLayout.LayoutParams(0,dp(46),1));
        if("requested".equals(status)){
            Button quote=button("Cotizar  →",true,v->quote(item));
            LinearLayout.LayoutParams qp=new LinearLayout.LayoutParams(0,dp(46),1);
            qp.leftMargin=dp(8);
            actions.addView(quote,qp);
        }
        card.addView(actions);
        appendCard(parent,card,12);
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
                        staffName=user.optString("name","");
                        tab="solicitudes";
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
                    canManageRoles = false;
                    managedAdmins = new JSONArray();
                    if(staffToken == null) {
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
        addLine(content,"Administración",25,INK,true,4);
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
            addLine(c,driver.optString("email",""),12,MUTED,false,7);
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
            appendCard(content,c,10);
        }
        if(canManageRoles) {
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
        addLine(body,"Ajustes",25,INK,true,4);
        addLine(body,"Cuenta, seguridad y aplicación",13,MUTED,false,19);

        LinearLayout account=card();
        addLine(account,"MI CUENTA",11,MUTED,true,10);
        addLine(account,staffName.isEmpty()?
            ("admin".equals(staffRole)?"Administrador general":"Conductor"):
            staffName,19,INK,true,5);
        addLine(account,"admin".equals(staffRole)?"Rol: administrador general":"Rol: conductor autorizado",
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
        addLine(info,"Versión 0.4.0 · Diseño renovado",13,MUTED,false,5);
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
        String[] titles=admin?
            new String[]{"Solicitudes","Viajes","Historial","Administrar","Ajustes"}:
            new String[]{"Solicitudes","Viajes","Historial","Ajustes"};
        String[] icons=admin?
            new String[]{"☷","▤","◷","◈","⚙"}:
            new String[]{"☷","▤","◷","⚙"};
        String[] values=admin?
            new String[]{"solicitudes","viajes","historial","administrar","ajustes"}:
            new String[]{"solicitudes","viajes","historial","ajustes"};
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
