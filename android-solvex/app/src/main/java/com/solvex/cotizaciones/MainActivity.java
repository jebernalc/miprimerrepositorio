package com.solvex.cotizaciones;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.Manifest;
import android.content.ClipData;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
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

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://jebernalc.github.io/miprimerrepositorio/?android=1&v=140";
    private static final int CREATE_PDF_REQUEST = 4102;
    private static final int MIC_REQUEST = 4301;

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
        webView.addJavascriptInterface(new AndroidVoiceBridge(), "AndroidVoice");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String host = u.getHost() == null ? "" : u.getHost();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                boolean own = host.equals("jebernalc.github.io");
                if (own || scheme.equals("blob") || scheme.equals("data") || scheme.equals("about")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
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
                "if(window.__solvexPdfNativeV130)return;window.__solvexPdfNativeV130=true;" +
                "async function pdfToBase64(){await asegurarJsPDF();const blob=crearPDFBlob();if(!blob||blob.size<100)throw new Error('El PDF generado está vacío');return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>{const s=String(r.result||'');const p=s.indexOf(',');if(p<0)return reject(new Error('No se pudo codificar el PDF'));resolve(s.substring(p+1));};r.onerror=()=>reject(new Error('No se pudo leer el PDF'));r.readAsDataURL(blob);});}" +
                "function formatCop(value){try{return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(value)||0);}catch(e){return '$ '+String(Number(value)||0);}}" +
                "async function nativeSavePdf(){try{if(window.exigirFirma&&!window.exigirFirma())return;toast('Generando PDF...');const b64=await pdfToBase64();AndroidPdf.savePdf(b64,nombrePDF());}catch(e){console.error(e);toast(e.message||'No se pudo generar el PDF','err');}}" +
                "async function nativeSharePdf(){try{if(window.exigirFirma&&!window.exigirFirma())return;toast('Preparando PDF para WhatsApp...');const b64=await pdfToBase64();const r=calcularFactura(state);const total=formatCop(r&&r.total);const tel=(typeof window.telefonoWhatsApp==='function')?window.telefonoWhatsApp(state&&state.meta&&state.meta.whatsapp):'';const crudo=String((state&&state.meta&&state.meta.whatsapp)||'').trim();if(crudo&&!tel){toast('El número de WhatsApp no es válido. Use 10 dígitos (ej. 3001234567) o con indicativo','err');return;}const m='Cotización '+((state&&state.meta&&state.meta.numero)||'SOLVEX')+' por '+total+((state&&state.meta&&state.meta.eds)?' — '+state.meta.eds:'')+'.';AndroidPdf.sharePdf(b64,nombrePDF(),m,tel);}catch(e){console.error(e);toast(e.message||'No se pudo generar o compartir el PDF','err');}}" +
                "function replaceButton(id,fn){const b=document.getElementById(id);if(!b)return;const n=b.cloneNode(true);b.parentNode.replaceChild(n,b);n.addEventListener('click',function(ev){ev.preventDefault();fn();});}" +
                "replaceButton('pdfBtn',nativeSavePdf);replaceButton('whatsappBtn',nativeSharePdf);window.__solvexNativeSavePdf=nativeSavePdf;window.__solvexNativeSharePdf=nativeSharePdf;" +
                "})();";
        webView.evaluateJavascript(js, null);
    }

    /* ---------- Voz nativa continua (SpeechRecognizer) ---------- */
    private SpeechRecognizer recognizer;
    private boolean wantListening = false;
    private int voiceErrors = 0;
    private final Handler voiceHandler = new Handler(Looper.getMainLooper());

    private void voiceEvent(String evt, String text) {
        runOnUiThread(() -> {
            if (webView == null) return;
            webView.evaluateJavascript("if(window.solvexVoz&&window.solvexVoz.nativo)window.solvexVoz.nativo(" + JSONObject.quote(evt) + "," + JSONObject.quote(text == null ? "" : text) + ");", null);
        });
    }

    private void startRecognizer() {
        if (!wantListening) return;
        try {
            if (!SpeechRecognizer.isRecognitionAvailable(this)) {
                wantListening = false;
                voiceEvent("error", "Este dispositivo no tiene reconocimiento de voz (instale o active Google / Servicios de voz).");
                return;
            }
            if (recognizer == null) {
                recognizer = SpeechRecognizer.createSpeechRecognizer(this);
                recognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle params) { voiceErrors = 0; voiceEvent("listo", ""); }
                    @Override public void onBeginningOfSpeech() { }
                    @Override public void onRmsChanged(float rmsdB) { }
                    @Override public void onBufferReceived(byte[] buffer) { }
                    @Override public void onEndOfSpeech() { }
                    @Override public void onEvent(int eventType, Bundle params) { }
                    @Override public void onPartialResults(Bundle partial) {
                        ArrayList<String> r = partial == null ? null : partial.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (r != null && !r.isEmpty()) voiceEvent("parcial", r.get(0));
                    }
                    @Override public void onResults(Bundle results) {
                        ArrayList<String> r = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (r != null && !r.isEmpty() && r.get(0) != null && !r.get(0).trim().isEmpty()) voiceEvent("final", r.get(0));
                        restartSoon(250);
                    }
                    @Override public void onError(int error) {
                        if (!wantListening) return;
                        if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                            wantListening = false;
                            voiceEvent("error", "Falta el permiso del micrófono. Actívelo en Ajustes > Aplicaciones > SOLVEX > Permisos.");
                            return;
                        }
                        if (error == SpeechRecognizer.ERROR_CLIENT) { restartSoon(600); return; }
                        if (error == SpeechRecognizer.ERROR_NETWORK || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT || error == SpeechRecognizer.ERROR_SERVER) {
                            voiceErrors++;
                            if (voiceErrors >= 3) { wantListening = false; voiceEvent("error", "El reconocimiento de voz necesita Internet o el paquete de voz sin conexión en español."); return; }
                        }
                        if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) { restartSoon(900); return; }
                        // sin voz / sin coincidencia: seguir escuchando
                        restartSoon(error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT ? 150 : 700);
                    }
                });
            }
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-CO");
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "es-CO");
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);
            recognizer.startListening(intent);
        } catch (Exception e) {
            wantListening = false;
            voiceEvent("error", "No se pudo iniciar la voz: " + safeMessage(e));
        }
    }

    private void restartSoon(long ms) {
        voiceHandler.postDelayed(() -> {
            if (!wantListening) { voiceEvent("fin", ""); return; }
            try { if (recognizer != null) recognizer.cancel(); } catch (Exception ignored) { }
            startRecognizer();
        }, ms);
    }

    private void stopRecognizer() {
        wantListening = false;
        voiceHandler.removeCallbacksAndMessages(null);
        try { if (recognizer != null) { recognizer.cancel(); recognizer.destroy(); } } catch (Exception ignored) { }
        recognizer = null;
        voiceEvent("fin", "");
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == MIC_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (wantListening) startRecognizer();
            } else {
                wantListening = false;
                voiceEvent("error", "Sin permiso de micrófono no puedo escuchar. Puede escribir el dictado en el recuadro del asistente.");
            }
        }
    }

    public class AndroidVoiceBridge {
        @JavascriptInterface
        public void startListening() {
            runOnUiThread(() -> {
                wantListening = true;
                voiceErrors = 0;
                if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    voiceEvent("permiso", "Autorice el micrófono para dictar.");
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC_REQUEST);
                    return;
                }
                startRecognizer();
            });
        }

        @JavascriptInterface
        public void stopListening() { runOnUiThread(MainActivity.this::stopRecognizer); }

        @JavascriptInterface
        public boolean isAvailable() { return SpeechRecognizer.isRecognitionAvailable(MainActivity.this); }
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
        public void sharePdf(String base64Pdf, String fileName, String message, String phone) {
            byte[] bytes = decodePdf(base64Pdf);
            if (bytes == null) return;
            runOnUiThread(() -> sharePdfNative(bytes, fileName, message, phone));
        }

        @JavascriptInterface
        public void sharePdf(String base64Pdf, String fileName, String message) {
            sharePdf(base64Pdf, fileName, message, "");
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

    private void sharePdfNative(byte[] pdfBytes, String fileName, String message, String phone) {
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
            String digits = phone == null ? "" : phone.replaceAll("\\D", "");
            boolean hasPhone = digits.length() >= 11 && digits.length() <= 15;
            // Con número: el extra "jid" hace que WhatsApp abra directamente el chat de ese contacto
            // con el PDF adjunto, listo para presionar Enviar.
            if (hasPhone) send.putExtra("jid", digits + "@s.whatsapp.net");
            if (isPackageAvailable("com.whatsapp")) {
                send.setPackage("com.whatsapp");
                startActivity(send);
                notifyJs(hasPhone ? "Chat de WhatsApp abierto con el PDF adjunto: solo presione Enviar" : "WhatsApp abierto con el PDF adjunto (elija el contacto)", false);
            } else if (isPackageAvailable("com.whatsapp.w4b")) {
                send.setPackage("com.whatsapp.w4b");
                startActivity(send);
                notifyJs(hasPhone ? "Chat de WhatsApp Business abierto con el PDF adjunto: solo presione Enviar" : "WhatsApp Business abierto con el PDF adjunto (elija el contacto)", false);
            } else {
                send.removeExtra("jid");
                send.setPackage(null);
                startActivity(Intent.createChooser(send, "Compartir cotización PDF"));
                notifyJs("WhatsApp no está instalado: seleccione una aplicación para enviar el PDF", false);
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
        if (!name.toLowerCase(Locale.ROOT).endsWith(".pdf")) name += ".pdf";
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
    protected void onPause() {
        if (wantListening) stopRecognizer();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidPdf");
            webView.removeJavascriptInterface("AndroidVoice");
            stopRecognizer();
            webView.destroy();
        }
        super.onDestroy();
    }
}
