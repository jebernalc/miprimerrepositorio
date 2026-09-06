package com.solvex.cotizaciones;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://jebernalc.github.io/miprimerrepositorio/";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new AndroidShareBridge(), "AndroidShare");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String host = request.getUrl().getHost();
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url != null && url.startsWith(APP_URL)) {
                    injectNativeWhatsAppShare();
                }
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void injectNativeWhatsAppShare() {
        String js = "(function(){" +
                "if(window.__solvexNativeShareInstalled)return;" +
                "window.__solvexNativeShareInstalled=true;" +
                "window.compartirWhatsApp=async function(){" +
                "try{" +
                "await asegurarJsPDF();" +
                "const blob=crearPDFBlob();" +
                "const fileName=nombrePDF();" +
                "const total=calcularFactura(state).total;" +
                "const mensaje='Cotización '+(state.meta.numero||'SOLVEX')+' por '+money(total)+(state.meta.eds?' — '+state.meta.eds:'')+'.';" +
                "const reader=new FileReader();" +
                "reader.onloadend=function(){" +
                "try{const b64=String(reader.result).split(',')[1];AndroidShare.sharePdf(b64,fileName,mensaje,(state.meta.whatsapp||''));toast('Abriendo WhatsApp con el PDF adjunto');}" +
                "catch(e){console.error(e);toast('No fue posible preparar el PDF para WhatsApp','err');}" +
                "};" +
                "reader.onerror=function(){toast('No fue posible leer el PDF generado','err');};" +
                "reader.readAsDataURL(blob);" +
                "}catch(e){console.error(e);toast(e.message||'Error al generar el PDF','err');}" +
                "};" +
                "const b=document.getElementById('whatsappBtn');" +
                "if(b){const nb=b.cloneNode(true);b.parentNode.replaceChild(nb,b);nb.addEventListener('click',window.compartirWhatsApp);}" +
                "})();";
        webView.evaluateJavascript(js, null);
    }

    public class AndroidShareBridge {
        @JavascriptInterface
        public void sharePdf(String base64Pdf, String fileName, String message, String phone) {
            if (base64Pdf == null || base64Pdf.isEmpty()) return;
            runOnUiThread(() -> {
                try {
                    byte[] pdfBytes = Base64.decode(base64Pdf, Base64.DEFAULT);
                    File pdfDir = new File(getCacheDir(), "pdf");
                    if (!pdfDir.exists() && !pdfDir.mkdirs()) {
                        throw new IOException("No se pudo crear el directorio temporal");
                    }
                    String safeName = sanitizeFileName(fileName);
                    File pdfFile = new File(pdfDir, safeName);
                    try (FileOutputStream fos = new FileOutputStream(pdfFile)) {
                        fos.write(pdfBytes);
                        fos.flush();
                    }

                    Uri uri = FileProvider.getUriForFile(
                            MainActivity.this,
                            getPackageName() + ".files",
                            pdfFile
                    );

                    Intent sendIntent = new Intent(Intent.ACTION_SEND);
                    sendIntent.setType("application/pdf");
                    sendIntent.putExtra(Intent.EXTRA_STREAM, uri);
                    sendIntent.putExtra(Intent.EXTRA_TEXT, message == null ? "Cotización SOLVEX" : message);
                    sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    sendIntent.setPackage("com.whatsapp");

                    try {
                        startActivity(sendIntent);
                    } catch (ActivityNotFoundException e) {
                        sendIntent.setPackage(null);
                        startActivity(Intent.createChooser(sendIntent, "Compartir cotización PDF"));
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                    if (webView != null) {
                        String msg = e.getMessage() == null ? "No fue posible compartir el PDF" : e.getMessage().replace("'", "\\'");
                        webView.evaluateJavascript("toast('" + msg + "','err')", null);
                    }
                }
            });
        }
    }

    private String sanitizeFileName(String input) {
        String name = (input == null || input.trim().isEmpty()) ? "Cotizacion-SOLVEX.pdf" : input.trim();
        name = name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (!name.toLowerCase().endsWith(".pdf")) name += ".pdf";
        return name;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidShare");
            webView.destroy();
        }
        super.onDestroy();
    }
}
