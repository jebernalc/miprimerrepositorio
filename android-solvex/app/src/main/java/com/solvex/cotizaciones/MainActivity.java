package com.solvex.cotizaciones;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
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
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://jebernalc.github.io/miprimerrepositorio/?android=1&v=102";
    private static final int CREATE_PDF_REQUEST = 4102;

    private WebView webView;
    private byte[] pendingPdfBytes;
    private String pendingPdfName;

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
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new AndroidPdfBridge(), "AndroidPdf");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url != null && url.contains("jebernalc.github.io/miprimerrepositorio")) {
                    installNativePdfHandlers();
                }
            }
        });

        if (savedInstanceState == null) {
            webView.clearCache(true);
            webView.loadUrl(APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void installNativePdfHandlers() {
        String js = "(function(){" +
                "if(window.__solvexPdfNativeV102)return;window.__solvexPdfNativeV102=true;" +
                "async function pdfToBase64(){" +
                "await asegurarJsPDF();" +
                "const blob=crearPDFBlob();" +
                "if(!blob||blob.size<100)throw new Error('El PDF generado está vacío');" +
                "return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>{const s=String(r.result||'');const p=s.indexOf(',');if(p<0)return reject(new Error('No se pudo codificar el PDF'));resolve(s.substring(p+1));};r.onerror=()=>reject(new Error('No se pudo leer el PDF'));r.readAsDataURL(blob);});" +
                "}" +
                "async function nativeSavePdf(){try{toast('Generando PDF...');const b64=await pdfToBase64();AndroidPdf.savePdf(b64,nombrePDF());}catch(e){console.error(e);toast(e.message||'No se pudo generar el PDF','err');}}" +
                "async function nativeSharePdf(){try{toast('Preparando PDF para WhatsApp...');const b64=await pdfToBase64();const r=calcularFactura(state);const m='Cotización '+(state.meta.numero||'SOLVEX')+' por '+money(r.total)+(state.meta.eds?' — '+state.meta.eds:'')+'.';AndroidPdf.sharePdf(b64,nombrePDF(),m);}catch(e){console.error(e);toast(e.message||'No se pudo generar el PDF','err');}}" +
                "function replaceButton(id,fn){const b=document.getElementById(id);if(!b)return;const n=b.cloneNode(true);b.parentNode.replaceChild(n,b);n.addEventListener('click',function(ev){ev.preventDefault();fn();});}" +
                "replaceButton('pdfBtn',nativeSavePdf);replaceButton('whatsappBtn',nativeSharePdf);" +
                "window.__solvexNativeSavePdf=nativeSavePdf;window.__solvexNativeSharePdf=nativeSharePdf;" +
                "})();";
        webView.evaluateJavascript(js, null);
    }

    public class AndroidPdfBridge {
        @JavascriptInterface
        public void savePdf(String base64Pdf, String fileName) {
            byte[] bytes = decodePdf(base64Pdf);
            if (bytes == null) return;
            pendingPdfBytes = bytes;
            pendingPdfName = sanitizeFileName(fileName);
            runOnUiThread(() -> {
                try {
                    Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    create.addCategory(Intent.CATEGORY_OPENABLE);
                    create.setType("application/pdf");
                    create.putExtra(Intent.EXTRA_TITLE, pendingPdfName);
                    startActivityForResult(create, CREATE_PDF_REQUEST);
                } catch (Exception e) {
                    notifyJs("No se pudo abrir el guardado del PDF: " + safeMessage(e), true);
                }
            });
        }

        @JavascriptInterface
        public void sharePdf(String base64Pdf, String fileName, String message) {
            byte[] bytes = decodePdf(base64Pdf);
            if (bytes == null) return;
            runOnUiThread(() -> sharePdfNative(bytes, fileName, message));
        }

        private byte[] decodePdf(String base64Pdf) {
            try {
                if (base64Pdf == null || base64Pdf.trim().isEmpty()) {
                    notifyJs("El PDF llegó vacío a Android", true);
                    return null;
                }
                byte[] bytes = Base64.decode(base64Pdf, Base64.DEFAULT);
                if (bytes.length < 100) {
                    notifyJs("El PDF generado no contiene datos válidos", true);
                    return null;
                }
                return bytes;
            } catch (Exception e) {
                notifyJs("No se pudo convertir el PDF: " + safeMessage(e), true);
                return null;
            }
        }
    }

    private void sharePdfNative(byte[] pdfBytes, String fileName, String message) {
        try {
            File pdfDir = new File(getCacheDir(), "pdf");
            if (!pdfDir.exists() && !pdfDir.mkdirs()) throw new IOException("No se pudo crear caché PDF");

            File pdfFile = new File(pdfDir, sanitizeFileName(fileName));
            try (FileOutputStream fos = new FileOutputStream(pdfFile)) {
                fos.write(pdfBytes);
                fos.flush();
            }

            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", pdfFile);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("application/pdf");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_TEXT, message == null ? "Cotización SOLVEX" : message);
            send.setClipData(ClipData.newRawUri("Cotización SOLVEX", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            if (isPackageAvailable("com.whatsapp")) {
                send.setPackage("com.whatsapp");
                startActivity(send);
                notifyJs("WhatsApp abierto con el PDF adjunto", false);
            } else if (isPackageAvailable("com.whatsapp.w4b")) {
                send.setPackage("com.whatsapp.w4b");
                startActivity(send);
                notifyJs("WhatsApp Business abierto con el PDF adjunto", false);
            } else {
                send.setPackage(null);
                startActivity(Intent.createChooser(send, "Compartir cotización PDF"));
                notifyJs("Selecciona WhatsApp para enviar el PDF", false);
            }
        } catch (ActivityNotFoundException e) {
            notifyJs("No se encontró una aplicación para compartir el PDF", true);
        } catch (Exception e) {
            notifyJs("Error al compartir el PDF: " + safeMessage(e), true);
        }
    }

    private boolean isPackageAvailable(String packageName) {
        try {
            getPackageManager().getPackageInfo(packageName, 0);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != CREATE_PDF_REQUEST) return;

        if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingPdfBytes != null) {
            Uri uri = data.getData();
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new IOException("No se pudo abrir el archivo destino");
                out.write(pendingPdfBytes);
                out.flush();
                notifyJs("PDF guardado correctamente", false);
            } catch (Exception e) {
                notifyJs("No se pudo guardar el PDF: " + safeMessage(e), true);
            }
        } else {
            notifyJs("Guardado de PDF cancelado", false);
        }
        pendingPdfBytes = null;
        pendingPdfName = null;
    }

    private String sanitizeFileName(String input) {
        String name = (input == null || input.trim().isEmpty()) ? "Cotizacion-SOLVEX.pdf" : input.trim();
        name = name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (!name.toLowerCase().endsWith(".pdf")) name += ".pdf";
        return name;
    }

    private String safeMessage(Exception e) {
        return e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
    }

    private void notifyJs(String message, boolean error) {
        runOnUiThread(() -> {
            if (webView == null) return;
            String safe = message == null ? "" : message.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ");
            webView.evaluateJavascript("if(typeof toast==='function')toast('" + safe + "'" + (error ? ",'err'" : "") + ");", null);
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidPdf");
            webView.destroy();
        }
        super.onDestroy();
    }
}
