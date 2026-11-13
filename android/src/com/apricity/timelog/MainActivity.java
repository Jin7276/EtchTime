package com.apricity.timelog;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.OutputStream;

public class MainActivity extends Activity {

    private static final int REQ_FILE = 1001;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try {
                    String[] types = params.getAcceptTypes();
                    String type = "*/*";
                    if (types != null && types.length > 0 && types[0] != null
                            && types[0].contains("/")) {
                        type = types[0];
                    }
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType(type);
                    startActivityForResult(Intent.createChooser(i, "选择文件"), REQ_FILE);
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
            }
        });

        if (android.os.Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 12);
        }

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE) {
            Uri[] out = null;
            if (res == RESULT_OK && data != null && data.getData() != null) {
                out = new Uri[]{data.getData()};
            }
            if (fileCallback != null) {
                fileCallback.onReceiveValue(out);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.__back ? window.__back() : 0)", value -> {
            if (!"1".equals(value)) finish();
        });
    }

    /** 保存备份到系统「下载」目录 */
    public class Bridge {

        /** 同步系统状态栏、导航栏颜色 */


        @JavascriptInterface
        public void syncTimer(String payload) {
            Intent i = new Intent(MainActivity.this, TimerService.class);
            if (payload == null || payload.isEmpty()) { stopService(i); return; }
            i.putExtra("sync", payload);
            if (android.os.Build.VERSION.SDK_INT >= 26) startForegroundService(i);
            else startService(i);
        }





        @JavascriptInterface
        public void setKeepScreen(final boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public void setBars(final boolean dark) {
            runOnUiThread(() -> {
                int color = dark ? 0xFF0B0B0B : 0xFFFFFFFF;
                getWindow().setStatusBarColor(color);
                getWindow().setNavigationBarColor(color);
                android.view.View decor = getWindow().getDecorView();
                int flags = decor.getSystemUiVisibility();
                if (dark) {
                    flags &= ~android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                } else {
                    flags |= android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                }
                decor.setSystemUiVisibility(flags);
                web.setBackgroundColor(color);
            });
        }

        @JavascriptInterface
        public String saveBackup(String json, String name) {
            try {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                cv.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = getContentResolver()
                        .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) return "无法创建文件";
                OutputStream os = getContentResolver().openOutputStream(uri);
                if (os == null) return "无法写入文件";
                os.write(json.getBytes("UTF-8"));
                os.flush();
                os.close();
                return "ok";
            } catch (Exception e) {
                return String.valueOf(e.getMessage());
            }
        }
    }
}
