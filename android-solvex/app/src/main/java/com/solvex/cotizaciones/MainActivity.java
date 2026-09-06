package com.solvex.cotizaciones;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.speech.RecognizerIntent;
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
    private static final String APP_URL = "https://jebernalc.github.io/miprimerrepositorio/?android=1&v=110";
    private static final int CREATE_PDF_REQUEST = 4102;
    private static final int VOICE_REQUEST = 4201;

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
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url != null && url.contains("jebernalc.github.io/miprimerrepositorio")) {
                    installNativePdfHandlers();
                    installVoiceAssistant();
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
                "if(window.__solvexPdfNativeV110)return;window.__solvexPdfNativeV110=true;" +
                "async function pdfToBase64(){await asegurarJsPDF();const blob=crearPDFBlob();if(!blob||blob.size<100)throw new Error('El PDF generado está vacío');return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>{const s=String(r.result||'');const p=s.indexOf(',');if(p<0)return reject(new Error('No se pudo codificar el PDF'));resolve(s.substring(p+1));};r.onerror=()=>reject(new Error('No se pudo leer el PDF'));r.readAsDataURL(blob);});}" +
                "async function nativeSavePdf(){try{toast('Generando PDF...');const b64=await pdfToBase64();AndroidPdf.savePdf(b64,nombrePDF());}catch(e){console.error(e);toast(e.message||'No se pudo generar el PDF','err');}}" +
                "async function nativeSharePdf(){try{toast('Preparando PDF para WhatsApp...');const b64=await pdfToBase64();const r=calcularFactura(state);const m='Cotización '+(state.meta.numero||'SOLVEX')+' por '+money(r.total)+(state.meta.eds?' — '+state.meta.eds:'')+'.';AndroidPdf.sharePdf(b64,nombrePDF(),m);}catch(e){console.error(e);toast(e.message||'No se pudo generar el PDF','err');}}" +
                "function replaceButton(id,fn){const b=document.getElementById(id);if(!b)return;const n=b.cloneNode(true);b.parentNode.replaceChild(n,b);n.addEventListener('click',function(ev){ev.preventDefault();fn();});}" +
                "replaceButton('pdfBtn',nativeSavePdf);replaceButton('whatsappBtn',nativeSharePdf);window.__solvexNativeSavePdf=nativeSavePdf;window.__solvexNativeSharePdf=nativeSharePdf;" +
                "})();";
        webView.evaluateJavascript(js, null);
    }

    private void installVoiceAssistant() {
        String js = "(function(){" +
                "if(window.__solvexVoiceV110)return;window.__solvexVoiceV110=true;" +
                "const defs=[" +
                "{key:'numero',id:'mNumero',a:['número de cotización','numero de cotización','número','numero']}," +
                "{key:'fecha',id:'mFecha',a:['fecha']}," +
                "{key:'cliente',id:'mCliente',a:['cliente','razón social','razon social']}," +
                "{key:'eds',id:'mEds',a:['estación de servicio','estacion de servicio','eds','estación','estacion']}," +
                "{key:'ciudad',id:'mCiudad',a:['ciudad','municipio']}," +
                "{key:'tecnico',id:'mTecnico',a:['técnico responsable','tecnico responsable','técnico','tecnico']}," +
                "{key:'whatsapp',id:'mWhatsApp',a:['whatsapp del cliente','whatsapp','teléfono','telefono','celular']}," +
                "{key:'notas',id:'mNotas',a:['observaciones','observación','observacion','notas','nota']}];" +
                "let lastField='';" +
                "document.addEventListener('focusin',e=>{if(defs.some(d=>d.id===e.target.id))lastField=e.target.id;});" +
                "function clean(v){return String(v||'').replace(/^[\\s,:;.-]+|[\\s,:;.-]+$/g,'').trim();}" +
                "function setField(id,v){const el=document.getElementById(id);if(!el||!v)return false;if(id==='mFecha'){const l=v.toLowerCase();if(l==='hoy'){const d=new Date();v=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}}if(id==='mWhatsApp')v=v.replace(/[^0-9+]/g,'');el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;}" +
                "function markers(text){const lower=text.toLowerCase();const out=[];defs.forEach(d=>d.a.forEach(a=>{let p=0;while((p=lower.indexOf(a,p))!==-1){out.push({i:p,e:p+a.length,id:d.id,key:d.key,a:a});p+=a.length;}}));out.sort((x,y)=>x.i-y.i||(y.e-y.i)-(x.e-x.i));const f=[];out.forEach(m=>{if(!f.some(x=>m.i>=x.i&&m.i<x.e))f.push(m);});return f;}" +
                "window.__solvexApplyVoiceTranscript=function(text){try{text=clean(text);if(!text)return toast('No se reconoció texto','err');const ms=markers(text);let count=0;if(ms.length){ms.forEach((m,idx)=>{let start=m.e;let end=idx+1<ms.length?ms[idx+1].i:text.length;let v=clean(text.substring(start,end).replace(/^(es|igual a|corresponde a)\\s+/i,''));if(v&&setField(m.id,v))count++;});}else if(lastField){if(setField(lastField,text))count=1;}else{if(setField('mNotas',text))count=1;}if(typeof saveState==='function')saveState();if(typeof render==='function')render();toast(count>1?'Asistente completó '+count+' campos':'Asistente completó el campo');}catch(e){console.error(e);toast('No pude distribuir el dictado: '+(e.message||e),'err');}};" +
                "const style=document.createElement('style');style.textContent='#solvexVoiceBtn{position:fixed;right:18px;bottom:82px;z-index:9999;width:64px;height:64px;border:0;border-radius:50%;background:linear-gradient(135deg,#25c8ef,#2f60dd);color:white;font-size:29px;box-shadow:0 10px 28px rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center}#solvexVoiceBtn:active{transform:scale(.94)}#solvexVoiceHint{position:fixed;right:18px;bottom:153px;z-index:9998;background:#0d1a31;color:#eef6ff;border:1px solid #25c8ef;border-radius:10px;padding:7px 10px;font-size:11px;box-shadow:0 8px 20px rgba(0,0,0,.28)}';document.head.appendChild(style);" +
                "const hint=document.createElement('div');hint.id='solvexVoiceHint';hint.textContent='Asistente de voz';document.body.appendChild(hint);" +
                "const b=document.createElement('button');b.id='solvexVoiceBtn';b.type='button';b.setAttribute('aria-label','Asistente de voz SOLVEX');b.textContent='🎙️';b.addEventListener('click',()=>{toast('Escuchando… diga cliente, EDS, ciudad, técnico, WhatsApp u observaciones');AndroidVoice.startListening();});document.body.appendChild(b);" +
                "})();";
        webView.evaluateJavascript(js, null);
    }

    public class AndroidVoiceBridge {
        @JavascriptInterface
        public void startListening() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-CO");
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "es-CO");
                    intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Asistente SOLVEX: dicte los datos de la cotización");
                    intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
                    startActivityForResult(intent, VOICE_REQUEST);
                } catch (ActivityNotFoundException e) {
                    notifyJs("Este dispositivo no tiene un servicio de reconocimiento de voz disponible", true);
                } catch (Exception e) {
                    notifyJs("No se pudo iniciar el asistente de voz: " + safeMessage(e), true);
                }
            });
        }
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
                if (base64Pdf == null || base64Pdf.trim().isEmpty()) { notifyJs("El PDF llegó vacío a Android", true); return null; }
                byte[] bytes = Base64.decode(base64Pdf, Base64.DEFAULT);
                if (bytes.length < 100) { notifyJs("El PDF generado no contiene datos válidos", true); return null; }
                return bytes;
            } catch (Exception e) { notifyJs("No se pudo convertir el PDF: " + safeMessage(e), true); return null; }
        }
    }

    private void sharePdfNative(byte[] pdfBytes, String fileName, String message) {
        try {
            File pdfDir = new File(getCacheDir(), "pdf");
            if (!pdfDir.exists() && !pdfDir.mkdirs()) throw new IOException("No se pudo crear caché PDF");
            File pdfFile = new File(pdfDir, sanitizeFileName(fileName));
            try (FileOutputStream fos = new FileOutputStream(pdfFile)) { fos.write(pdfBytes); fos.flush(); }
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", pdfFile);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("application/pdf");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_TEXT, message == null ? "Cotización SOLVEX" : message);
            send.setClipData(ClipData.newRawUri("Cotización SOLVEX", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (isPackageAvailable("com.whatsapp")) { send.setPackage("com.whatsapp"); startActivity(send); notifyJs("WhatsApp abierto con el PDF adjunto", false); }
            else if (isPackageAvailable("com.whatsapp.w4b")) { send.setPackage("com.whatsapp.w4b"); startActivity(send); notifyJs("WhatsApp Business abierto con el PDF adjunto", false); }
            else { send.setPackage(null); startActivity(Intent.createChooser(send, "Compartir cotización PDF")); notifyJs("Selecciona WhatsApp para enviar el PDF", false); }
        } catch (ActivityNotFoundException e) { notifyJs("No se encontró una aplicación para compartir el PDF", true); }
        catch (Exception e) { notifyJs("Error al compartir el PDF: " + safeMessage(e), true); }
    }

    private boolean isPackageAvailable(String packageName) {
        try { getPackageManager().getPackageInfo(packageName, 0); return true; } catch (Exception e) { return false; }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == VOICE_REQUEST) {
            if (resultCode == RESULT_OK && data != null) {
                ArrayList<String> results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (results != null && !results.isEmpty()) {
                    String transcript = results.get(0);
                    String quoted = JSONObject.quote(transcript == null ? "" : transcript);
                    if (webView != null) webView.evaluateJavascript("if(window.__solvexApplyVoiceTranscript)window.__solvexApplyVoiceTranscript(" + quoted + ");", null);
                } else notifyJs("No se reconoció ningún texto", true);
            } else notifyJs("Dictado cancelado", false);
            return;
        }

        if (requestCode != CREATE_PDF_REQUEST) return;
        if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingPdfBytes != null) {
            Uri uri = data.getData();
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new IOException("No se pudo abrir el archivo destino");
                out.write(pendingPdfBytes); out.flush(); notifyJs("PDF guardado correctamente", false);
            } catch (Exception e) { notifyJs("No se pudo guardar el PDF: " + safeMessage(e), true); }
        } else notifyJs("Guardado de PDF cancelado", false);
        pendingPdfBytes = null;
        pendingPdfName = null;
    }

    private String sanitizeFileName(String input) {
        String name = (input == null || input.trim().isEmpty()) ? "Cotizacion-SOLVEX.pdf" : input.trim();
        name = name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (!name.toLowerCase(Locale.ROOT).endsWith(".pdf")) name += ".pdf";
        return name;
    }

    private String safeMessage(Exception e) { return e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage(); }

    private void notifyJs(String message, boolean error) {
        runOnUiThread(() -> {
            if (webView == null) return;
            String safe = message == null ? "" : message.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ");
            webView.evaluateJavascript("if(typeof toast==='function')toast('" + safe + "'" + (error ? ",'err'" : "") + ");", null);
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) { webView.saveState(outState); super.onSaveInstanceState(outState); }

    @Override
    public void onBackPressed() { if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed(); }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidPdf");
            webView.removeJavascriptInterface("AndroidVoice");
            webView.destroy();
        }
        super.onDestroy();
    }
}
