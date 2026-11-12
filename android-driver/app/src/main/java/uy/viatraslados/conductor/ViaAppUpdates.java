package uy.viatraslados.conductor;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Avisa de actualizaciones QA publicadas, comprueba SHA-256 y deja la
 * aprobación final de la instalación en manos de Android.
 * Solo acepta un manifiesto y APK del origen de distribución de Vía.
 */
public final class ViaAppUpdates {
    private static final String HOST = "via-conductor-apk-qa.vercel.app";
    private static final String BASE = "https://" + HOST + "/";
    private static final String MANIFEST_URL = BASE + "latest.json";
    private static final String PREFS = "via_updates";
    private static final long CHECK_INTERVAL = 6L * 60 * 60 * 1000;
    private static final AtomicBoolean BUSY = new AtomicBoolean(false);
    private static final Handler UI = new Handler(Looper.getMainLooper());

    private ViaAppUpdates() {}

    public static void onForeground(Activity activity) {
        resumeDownload(activity);
        final long last = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getLong("last_check", 0);
        if (System.currentTimeMillis() - last > CHECK_INTERVAL) check(activity, false);
    }

    public static void check(Activity activity, boolean manual) {
        if (!BUSY.compareAndSet(false, true)) return;
        new Thread(() -> {
            try {
                JSONObject doc = readManifest();
                if (!"qa".equals(doc.optString("channel")) ||
                    !activity.getPackageName().equals(doc.optString("packageName")))
                    throw new IllegalArgumentException("Canal o aplicación incorrecta");
                final int nextCode = doc.getInt("versionCode");
                final long currentCode = currentVersionCode(activity);
                final String nextName = doc.optString("versionName", "Nueva versión");
                final String notes = doc.optString("notes", "Mejoras y correcciones.");
                final String download = doc.getString("apkUrl");
                final String checksum = doc.getString("sha256").toLowerCase(Locale.ROOT);
                if (!download.matches("https://" + HOST.replace(".", "\\.") +
                    "/[a-zA-Z0-9_.-]+\\.apk") || !checksum.matches("[0-9a-f]{64}"))
                    throw new IllegalArgumentException("Publicación no verificada");
                activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putLong("last_check", System.currentTimeMillis()).apply();
                UI.post(() -> {
                    if (activity.isFinishing() || activity.isDestroyed()) return;
                    if (nextCode <= currentCode) {
                        if (manual) toast(activity, "Ya tenés la versión más reciente publicada.");
                        return;
                    }
                    SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                    long lastShownAt = prefs.getLong("last_prompt_time", 0);
                    int lastShownCode = prefs.getInt("last_prompt_code", -1);
                    if (!manual && lastShownCode == nextCode &&
                        System.currentTimeMillis() - lastShownAt < CHECK_INTERVAL) return;
                    prefs.edit().putInt("last_prompt_code", nextCode)
                        .putLong("last_prompt_time", System.currentTimeMillis()).apply();
                    new AlertDialog.Builder(activity)
                        .setTitle("Actualización disponible · " + nextName)
                        .setMessage(notes + "\n\nLa descarga se verificará antes de abrir el instalador. Android te pedirá confirmar la instalación.")
                        .setNegativeButton("Más tarde", null)
                        .setPositiveButton("Actualizar", (dialog, which) ->
                            beginDownload(activity, nextCode, download, checksum))
                        .show();
                });
            } catch (Exception e) {
                if (manual) UI.post(() -> toast(activity,
                    "No se pudieron comprobar las actualizaciones. Revisá la conexión."));
            } finally {
                BUSY.set(false);
            }
        }, "via-update-check").start();
    }

    private static JSONObject readManifest() throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(MANIFEST_URL).openConnection();
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(8000);
        conn.setInstanceFollowRedirects(false);
        conn.setUseCaches(false);
        try {
            if (conn.getResponseCode() != 200) throw new IllegalStateException("HTTP manifest");
            try (InputStream input = conn.getInputStream();
                 ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] block = new byte[2048];
                int n;
                while ((n = input.read(block)) != -1) {
                    if (bytes.size() + n > 16384)
                        throw new IllegalArgumentException("Manifiesto demasiado grande");
                    bytes.write(block, 0, n);
                }
                return new JSONObject(bytes.toString("UTF-8"));
            }
        } finally {
            conn.disconnect();
        }
    }

    private static long currentVersionCode(Activity activity) throws Exception {
        PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }

    private static void beginDownload(Activity activity, int versionCode,
                                       String apkUrl, String checksum) {
        try {
            File directory = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (directory == null) throw new IllegalStateException("Almacenamiento no disponible");
            String name = "via-traslados-qa-" + versionCode + ".apk";
            File old = new File(directory, name);
            if (old.exists() && !old.delete()) throw new IllegalStateException("Archivo ocupado");
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
            request.setTitle("Vía Traslados · actualización QA");
            request.setDescription("Descargando versión verificada");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setMimeType("application/vnd.android.package-archive");
            request.setAllowedOverMetered(true);
            request.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, name);
            DownloadManager manager = (DownloadManager)
                activity.getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) throw new IllegalStateException("Descargas no disponibles");
            long id = manager.enqueue(request);
            activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putLong("download_id", id).putString("sha256", checksum)
                .putInt("next_version_code", versionCode).apply();
            toast(activity, "Descargando actualización…");
            BroadcastReceiver receiver = new BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) {
                    if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction()) &&
                        intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) == id) {
                        try { activity.unregisterReceiver(this); } catch (Exception ignored) {}
                        if (!activity.isFinishing() && !activity.isDestroyed())
                            resumeDownload(activity);
                    }
                }
            };
            IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
            if (Build.VERSION.SDK_INT >= 33)
                activity.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
            else activity.registerReceiver(receiver, filter);
        } catch (Exception e) {
            toast(activity, "No se pudo comenzar la descarga. Usá el centro de descargas.");
            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(BASE)));
            } catch (Exception ignored) {}
        }
    }

    private static void resumeDownload(Activity activity) {
        SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long id = prefs.getLong("download_id", -1);
        if (id < 0) {
            String pending = prefs.getString("install_uri", null);
            if (pending != null) openInstaller(activity, Uri.parse(pending));
            return;
        }
        DownloadManager manager = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) return;
        try (Cursor c = manager.query(new DownloadManager.Query().setFilterById(id))) {
            if (c == null || !c.moveToFirst()) return;
            int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (status == DownloadManager.STATUS_FAILED) {
                prefs.edit().remove("download_id").apply();
                toast(activity, "Falló la descarga. Podés reintentarla desde Ajustes.");
                return;
            }
            if (status != DownloadManager.STATUS_SUCCESSFUL) return;
        } catch (Exception ignored) {
            return;
        }
        // Se marca como procesada antes de verificar para no abrir el instalador dos veces.
        String expected = prefs.getString("sha256", "");
        int version = prefs.getInt("next_version_code", -1);
        prefs.edit().remove("download_id").apply();
        Uri uri = manager.getUriForDownloadedFile(id);
        if (uri == null) { toast(activity, "No se encontró la APK descargada."); return; }
        new Thread(() -> {
            boolean valid = false;
            try (InputStream in = activity.getContentResolver().openInputStream(uri)) {
                if (in == null) throw new IllegalStateException();
                MessageDigest dig = MessageDigest.getInstance("SHA-256");
                byte[] b = new byte[8192];
                int n;
                while ((n = in.read(b)) != -1) dig.update(b, 0, n);
                StringBuilder sb = new StringBuilder(64);
                for (byte x : dig.digest()) sb.append(String.format(Locale.ROOT, "%02x", x & 0xff));
                valid = sb.toString().equals(expected) && version > currentVersionCode(activity);
                File apk = new File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                    "via-traslados-qa-" + version + ".apk");
                PackageInfo archive = activity.getPackageManager()
                    .getPackageArchiveInfo(apk.getAbsolutePath(), 0);
                valid &= archive != null && activity.getPackageName().equals(archive.packageName) &&
                    (Build.VERSION.SDK_INT >= 28 ? archive.getLongVersionCode() : archive.versionCode) == version;
            } catch (Exception ignored) {}
            boolean result = valid;
            UI.post(() -> {
                if (!result) {
                    manager.remove(id);
                    toast(activity, "La actualización no superó la verificación de integridad.");
                } else {
                    prefs.edit().putString("install_uri", uri.toString()).apply();
                    openInstaller(activity, uri);
                }
            });
        }, "via-update-sha256").start();
    }

    private static void openInstaller(Activity activity, Uri uri) {
        if (Build.VERSION.SDK_INT >= 26 &&
            !activity.getPackageManager().canRequestPackageInstalls()) {
            try {
                toast(activity, "Autorizá la instalación desde Vía Traslados y volvé a la app.");
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName()));
                activity.startActivity(settings);
            } catch (Exception e) {
                toast(activity, "Permití la instalación desde los ajustes de Android.");
            }
            return;
        }
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().remove("install_uri").apply();
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(intent);
        } catch (Exception e) {
            toast(activity, "No se pudo abrir el instalador. Revisá Descargas.");
        }
    }

    private static void toast(Activity activity, String value) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        Toast.makeText(activity, value, Toast.LENGTH_LONG).show();
    }
}
