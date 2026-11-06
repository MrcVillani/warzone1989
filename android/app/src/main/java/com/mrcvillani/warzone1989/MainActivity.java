package com.mrcvillani.warzone1989;

import android.annotation.TargetApi;
import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.DisplayCutout;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

/**
 * Guscio del gioco: una WebView a schermo intero che carica dist/index.html dagli asset.
 * Le regole e l'interfaccia stanno tutte nella pagina; qui ci sono solo finestra, ciclo di vita e tasto Indietro.
 */
public class MainActivity extends Activity {

    private static final String GAME_URL = "file:///android_asset/index.html";
    private static final int INK = Color.rgb(0x11, 0x14, 0x12);
    private static final long BACK_WINDOW_MS = 2000;

    private WebView web;
    private long lastBack;
    private Toast backToast;
    private OnBackInvokedCallback backCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(INK);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setTextZoom(100); // la dimensione del testo di sistema non deve rompere il layout del gioco
        s.setMediaPlaybackRequiresUserGesture(false);

        // Il gioco è una sola pagina locale: ogni altro indirizzo resta fuori.
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().startsWith("file:///android_asset/");
            }
        });

        // Da Android 15 la finestra va sempre da bordo a bordo: il gioco resta fuori dal foro della fotocamera.
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(INK);
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT >= 28) {
            root.setOnApplyWindowInsetsListener(MainActivity::fitCutout);
        }
        setContentView(root);
        hideSystemBars();

        web.loadUrl(GAME_URL);

        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
    }

    /** Tiene la pagina fuori dal foro della fotocamera e consuma gli inset: la WebView non li riapplica. */
    @TargetApi(Build.VERSION_CODES.P)
    @SuppressWarnings("deprecation")
    private static WindowInsets fitCutout(View v, WindowInsets insets) {
        DisplayCutout cut = insets.getDisplayCutout();
        if (cut != null) {
            v.setPadding(cut.getSafeInsetLeft(), cut.getSafeInsetTop(),
                    cut.getSafeInsetRight(), cut.getSafeInsetBottom());
        } else {
            v.setPadding(0, 0, 0, 0);
        }
        return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeDisplayCutout();
    }

    /** Primo Indietro: avviso. Secondo entro 2 secondi: esce. */
    private void handleBack() {
        long now = SystemClock.elapsedRealtime();
        if (now - lastBack < BACK_WINDOW_MS) {
            if (backToast != null) backToast.cancel();
            finish();
            return;
        }
        lastBack = now;
        backToast = Toast.makeText(this, R.string.back_again, Toast.LENGTH_SHORT);
        backToast.show();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // Android 7–12; da Android 13 passa da backCallback.
        handleBack();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.resumeTimers();
    }

    @Override
    protected void onPause() {
        web.onPause();
        web.pauseTimers();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        }
        web.destroy();
        super.onDestroy();
    }
}
