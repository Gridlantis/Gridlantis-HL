package local.openhl.app;

// Open HL for Android: a WebView around an Open HL server, like the desktop app.
//
// It holds no Open HL logic of its own. It remembers which servers you use,
// keeps the login cookie, and adds what a plain browser tab handles poorly:
// file uploads and downloads with the session, the back button, microphone
// and camera prompts, and pinning a self-signed HTTPS certificate.

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslCertificate;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;

import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private static final String CONNECT_PAGE = "file:///android_asset/connect.html";
    private static final int REQ_FILE = 1, REQ_PERMS = 2, REQ_STORAGE = 3;
    private static final int MAX_SERVERS = 8;
    private static final int DEFAULT_BG = 0xff151b23;   // Slate, the default theme

    private WebView web;
    private SharedPreferences prefs;
    private volatile String currentUrl = "";
    private String serverOrigin;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingPermission;
    private Runnable pendingDownload;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        prefs = getSharedPreferences("openhl", MODE_PRIVATE);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        web = new WebView(this);
        web.setBackgroundColor(DEFAULT_BG);
        setContentView(web);
        setBars(DEFAULT_BG, DEFAULT_BG, true);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setAllowFileAccess(false);   // assets still load; the device's files do not
        s.setUserAgentString(s.getUserAgentString() + " OpenHLAndroid/" + BuildInfo.VERSION);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new ConnectBridge(), "OpenHLConnect");
        web.addJavascriptInterface(new AppBridge(), "openhlAndroid");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener(this::download);

        if (saved != null && web.restoreState(saved) != null) {
            serverOrigin = saved.getString("origin");
            return;
        }
        String last = prefs.getString("last", null);
        if (last != null) open(last); else showConnect(null);
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
        out.putString("origin", serverOrigin);
    }

    @Override protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    // ── Servers ──────────────────────────────────────────────────────────────
    private List<String> servers() {
        List<String> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(prefs.getString("servers", "[]"));
            for (int i = 0; i < a.length(); i++) out.add(a.getString(i));
        } catch (Exception ignored) {}
        return out;
    }

    private void saveServers(List<String> list) {
        prefs.edit().putString("servers", new JSONArray(list).toString()).apply();
    }

    static String normalize(String input) {
        String u = input == null ? "" : input.trim();
        if (u.isEmpty()) throw new IllegalArgumentException("Enter the server address");
        if (!u.matches("(?i)^https?://.*")) u = "http://" + u;
        Uri x = Uri.parse(u);
        if (x.getHost() == null || x.getHost().isEmpty()) throw new IllegalArgumentException("That address has no host name");
        String origin = x.getScheme().toLowerCase() + "://" + x.getHost() + (x.getPort() > 0 ? ":" + x.getPort() : "");
        return origin;
    }

    static String originOf(String url) {
        try { return normalize(url); } catch (Exception e) { return null; }
    }

    private void open(String origin) {
        serverOrigin = origin;
        List<String> list = servers();
        list.remove(origin);
        list.add(0, origin);
        while (list.size() > MAX_SERVERS) list.remove(list.size() - 1);
        saveServers(list);
        prefs.edit().putString("last", origin).apply();
        web.loadUrl(origin + "/");
    }

    private void showConnect(String error) {
        serverOrigin = null;
        prefs.edit().remove("last").apply();
        setBars(DEFAULT_BG, DEFAULT_BG, true);
        String url = CONNECT_PAGE + (error == null ? "" : "?error=" + Uri.encode(error));
        web.loadUrl(url);
        web.postDelayed(web::clearHistory, 400);
    }

    private boolean onConnectPage() { return currentUrl.startsWith(CONNECT_PAGE); }
    private boolean onServerPage() { return serverOrigin != null && serverOrigin.equals(originOf(currentUrl)); }

    // The connect screen's bridge. Only answers while the connect screen is showing.
    class ConnectBridge {
        @JavascriptInterface public String servers() {
            return onConnectPage() ? new JSONArray(MainActivity.this.servers()).toString() : "[]";
        }
        @JavascriptInterface public String connect(String url) {
            if (!onConnectPage()) return "Not allowed here";
            try {
                String origin = normalize(url);
                runOnUiThread(() -> open(origin));
                return null;
            } catch (Exception e) { return e.getMessage(); }
        }
        @JavascriptInterface public void forget(String url) {
            if (!onConnectPage()) return;
            List<String> list = MainActivity.this.servers();
            list.remove(url);
            saveServers(list);
        }
    }

    // What Open HL pages can see: that they run in the app, and a way back to
    // the connect screen. Only answers for the server the app connected to.
    class AppBridge {
        @JavascriptInterface public String version() { return BuildInfo.VERSION; }
        @JavascriptInterface public void switchServer() {
            if (onServerPage()) runOnUiThread(() -> showConnect(null));
        }
        // The page's theme colours the status and navigation bars, with dark
        // or light icons to suit.
        @JavascriptInterface public void setTheme(String top, String bottom, boolean dark) {
            if (!onServerPage()) return;
            int t, b;
            try { t = Color.parseColor(top); b = Color.parseColor(bottom); } catch (Exception e) { return; }
            runOnUiThread(() -> { web.setBackgroundColor(b); setBars(t, b, dark); });
        }
    }

    @SuppressWarnings("deprecation")
    private void setBars(int top, int bottom, boolean dark) {
        getWindow().setStatusBarColor(top | 0xff000000);
        getWindow().setNavigationBarColor(bottom | 0xff000000);
        View d = getWindow().getDecorView();
        int f = d.getSystemUiVisibility() & ~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if (!dark) {
            f |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 26) f |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        d.setSystemUiVisibility(f);
    }

    // ── Navigation ───────────────────────────────────────────────────────────
    class Client extends WebViewClient {
        @Override public void onPageStarted(WebView v, String url, Bitmap icon) { currentUrl = url == null ? "" : url; }

        @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            String scheme = u.getScheme() == null ? "" : u.getScheme();
            if (scheme.equals("file")) return !u.toString().startsWith(CONNECT_PAGE);
            if (scheme.equals("http") || scheme.equals("https")) {
                if (serverOrigin != null && serverOrigin.equals(originOf(u.toString()))) return false;
                external(u);   // other sites open in the browser, as in the desktop app
                return true;
            }
            external(u);       // mailto:, tel:, intent: and the like
            return true;
        }

        @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
            if (!r.isForMainFrame() || serverOrigin == null) return;
            showConnect("Could not reach " + serverOrigin + ": " + e.getDescription());
        }

        @Override public void onReceivedSslError(WebView v, SslErrorHandler h, SslError err) {
            String host = Uri.parse(err.getUrl()).getHost();
            String fp = fingerprint(err.getCertificate());
            String pinned = prefs.getString("trust:" + host, null);
            if (fp != null && fp.equals(pinned)) { h.proceed(); return; }
            if (pinned != null) {
                h.cancel();
                showConnect("The certificate of " + host + " changed since you trusted it. Refusing to connect.");
                return;
            }
            new AlertDialog.Builder(MainActivity.this)
                .setTitle("Untrusted certificate")
                .setMessage(host + " uses a certificate this phone does not trust (for example a self-signed one).\n\n"
                    + "SHA-256: " + (fp == null ? "unknown" : fp) + "\n\nTrust it from now on? A different certificate will be refused.")
                .setPositiveButton("Trust", (d, w) -> {
                    if (fp != null) prefs.edit().putString("trust:" + host, fp).apply();
                    h.proceed();
                })
                .setNegativeButton("Cancel", (d, w) -> { h.cancel(); showConnect(null); })
                .setOnCancelListener(d -> { h.cancel(); showConnect(null); })
                .show();
        }
    }

    private static String fingerprint(SslCertificate cert) {
        try {
            byte[] der = SslCertificate.saveState(cert).getByteArray("x509-certificate");
            if (der == null) return null;
            byte[] d = MessageDigest.getInstance("SHA-256").digest(der);
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < d.length; i++) sb.append(i == 0 ? "" : ":").append(String.format("%02X", d[i]));
            return sb.toString();
        } catch (Exception e) { return null; }
    }

    private void external(Uri u) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); }
        catch (Exception e) { Toast.makeText(this, "No app can open " + u, Toast.LENGTH_SHORT).show(); }
    }

    // ── Uploads, camera, microphone ──────────────────────────────────────────
    class Chrome extends WebChromeClient {
        @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb;
            try {
                Intent i = p.createIntent();
                if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                startActivityForResult(Intent.createChooser(i, "Choose file"), REQ_FILE);
            } catch (Exception e) {
                fileCallback = null;
                return false;
            }
            return true;
        }

        @Override public void onPermissionRequest(PermissionRequest r) {
            runOnUiThread(() -> {
                if (serverOrigin == null || !serverOrigin.equals(originOf(r.getOrigin().toString()))) { r.deny(); return; }
                List<String> need = new ArrayList<>();
                for (String res : r.getResources()) {
                    if (res.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) need.add(Manifest.permission.RECORD_AUDIO);
                    if (res.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) need.add(Manifest.permission.CAMERA);
                }
                List<String> missing = new ArrayList<>();
                for (String n : need) if (checkSelfPermission(n) != PackageManager.PERMISSION_GRANTED) missing.add(n);
                if (missing.isEmpty()) { r.grant(r.getResources()); return; }
                if (pendingPermission != null) pendingPermission.deny();
                pendingPermission = r;
                requestPermissions(missing.toArray(new String[0]), REQ_PERMS);
            });
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code == REQ_STORAGE) {
            Runnable r = pendingDownload;
            pendingDownload = null;
            if (r != null && results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) r.run();
            else Toast.makeText(this, "Downloads need storage access", Toast.LENGTH_LONG).show();
            return;
        }
        if (code != REQ_PERMS || pendingPermission == null) return;
        boolean ok = true;
        for (int g : results) ok &= g == PackageManager.PERMISSION_GRANTED;
        if (ok && results.length > 0) pendingPermission.grant(pendingPermission.getResources());
        else pendingPermission.deny();
        pendingPermission = null;
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code != REQ_FILE || fileCallback == null) return;
        Uri[] uris = null;
        if (result == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                uris = new Uri[data.getClipData().getItemCount()];
                for (int i = 0; i < uris.length; i++) uris[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) {
                uris = new Uri[] { data.getData() };
            }
        }
        fileCallback.onReceiveValue(uris);
        fileCallback = null;
    }

    // ── Downloads ────────────────────────────────────────────────────────────
    private void download(String url, String userAgent, String disposition, String mime, long length) {
        if (url.startsWith("blob:") || url.startsWith("data:")) {
            Toast.makeText(this, "This file can only be saved from a browser", Toast.LENGTH_LONG).show();
            return;
        }
        if (Build.VERSION.SDK_INT < 29
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            pendingDownload = () -> download(url, userAgent, disposition, mime, length);
            requestPermissions(new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE }, REQ_STORAGE);
            return;
        }
        try {
            String name = URLUtil.guessFileName(url, disposition, mime);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) req.addRequestHeader("Cookie", cookies);
            req.addRequestHeader("User-Agent", userAgent);
            if (mime != null) req.setMimeType(mime);
            req.setTitle(name);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(req);
            Toast.makeText(this, "Downloading " + name, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Download failed: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }
}
