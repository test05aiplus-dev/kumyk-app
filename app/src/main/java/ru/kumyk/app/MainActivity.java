package ru.kumyk.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.util.Locale;

/**
 * Оболочка приложения: показывает офлайн-интерфейс из assets/www
 * через WebViewAssetLoader (страница работает как обычный https-сайт,
 * поэтому localStorage с прогрессом ученика надёжно сохраняется).
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/assets/www/index.html";
    private static final int INDIGO = 0xFF22306B;

    private WebView web;
    private View statusBg;
    private TextToSpeech tts;
    /** "loading", "tr", "ru" или "none" — какой голос сейчас доступен. */
    private volatile String ttsLang = "loading";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);

        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        statusBg = new View(this);
        statusBg.setBackgroundColor(INDIGO);
        root.addView(statusBg, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, Gravity.TOP));

        root.setOnApplyWindowInsetsListener(this::applyInsets);
        setContentView(root);
        // Только после setContentView: до этого у окна ещё нет DecorView,
        // и getInsetsController() на Android 11+ падает с NullPointerException.
        goEdgeToEdge();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);

        initTts();
        // Мост для озвучки: страница вызывает KumykNative.speak(...)
        web.addJavascriptInterface(new SpeechBridge(), "KumykNative");

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost())) return false;
                // Внешние ссылки (Telegram, сайты) открываем в браузере
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                }
                return true;
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(START_URL);
        }
    }

    /**
     * Синтез речи. Кумыкского голоса нет ни в одном движке, поэтому берём
     * турецкий (близкая фонетика, текст передаётся в латинской транскрипции),
     * а если его нет — русский (читает кириллицу как есть).
     */
    private void initTts() {
        tts = new TextToSpeech(getApplicationContext(), status -> {
            if (status != TextToSpeech.SUCCESS || tts == null) {
                ttsLang = "none";
                return;
            }
            Locale tr = Locale.forLanguageTag("tr-TR");
            Locale ru = Locale.forLanguageTag("ru-RU");
            if (tts.isLanguageAvailable(tr) >= TextToSpeech.LANG_AVAILABLE
                    && tts.setLanguage(tr) >= TextToSpeech.LANG_AVAILABLE) {
                ttsLang = "tr";
            } else if (tts.isLanguageAvailable(ru) >= TextToSpeech.LANG_AVAILABLE
                    && tts.setLanguage(ru) >= TextToSpeech.LANG_AVAILABLE) {
                ttsLang = "ru";
            } else {
                ttsLang = "none";
            }
            tts.setSpeechRate(0.85f);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {
                }

                @Override
                public void onDone(String utteranceId) {
                    notifyDone(utteranceId);
                }

                @Override
                @SuppressWarnings("deprecation")
                public void onError(String utteranceId) {
                    notifyDone(utteranceId);
                }

                @Override
                public void onError(String utteranceId, int errorCode) {
                    notifyDone(utteranceId);
                }
            });
        });
    }

    /** Сообщаем странице, что фраза договорена — нужно для проигрывания диалога подряд. */
    private void notifyDone(String utteranceId) {
        if (utteranceId == null) return;
        final String js = "window.__ttsDone && window.__ttsDone(" + JSONObject.quote(utteranceId) + ")";
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(js, null);
        });
    }

    private class SpeechBridge {
        @JavascriptInterface
        public String engine() {
            return ttsLang;
        }

        /** cyrillic — исходный текст, latin — транскрипция для турецкого голоса. */
        @JavascriptInterface
        public void speak(String cyrillic, String latin) {
            speakEx(cyrillic, latin, 1f, "kumyk");
        }

        /** То же с высотой голоса (разные собеседники) и id для сигнала об окончании. */
        @JavascriptInterface
        public void speakEx(String cyrillic, String latin, float pitch, String id) {
            TextToSpeech t = tts;
            if (t == null) return;
            String lang = ttsLang;
            String text;
            if ("tr".equals(lang)) {
                text = latin;
            } else if ("ru".equals(lang)) {
                text = cyrillic;
            } else {
                return;
            }
            t.setPitch(Math.max(0.5f, Math.min(2f, pitch)));
            t.speak(text, TextToSpeech.QUEUE_FLUSH, null, id);
        }

        @JavascriptInterface
        public void stop() {
            TextToSpeech t = tts;
            if (t != null) t.stop();
        }
    }

    /** Рисуем под системными панелями сами — одинаково на всех версиях Android. */
    @SuppressWarnings("deprecation")
    private void goEdgeToEdge() {
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                // светлые значки в статус-баре (он индиго), тёмные — в панели навигации (она белая)
                c.setSystemBarsAppearance(
                        WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                        WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                                | WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
    }

    @SuppressWarnings("deprecation")
    private WindowInsets applyInsets(View v, WindowInsets insets) {
        int left, top, right, bottom;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsets.Type.ime());
            left = bars.left;
            top = bars.top;
            right = bars.right;
            bottom = Math.max(bars.bottom, ime.bottom);
        } else {
            left = insets.getSystemWindowInsetLeft();
            top = insets.getSystemWindowInsetTop();
            right = insets.getSystemWindowInsetRight();
            bottom = insets.getSystemWindowInsetBottom();
        }

        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) web.getLayoutParams();
        lp.setMargins(left, top, right, bottom);
        web.setLayoutParams(lp);

        FrameLayout.LayoutParams sp = (FrameLayout.LayoutParams) statusBg.getLayoutParams();
        sp.height = top;
        statusBg.setLayoutParams(sp);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) return WindowInsets.CONSUMED;
        return insets.consumeSystemWindowInsets();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            tts.shutdown();
            tts = null;
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
