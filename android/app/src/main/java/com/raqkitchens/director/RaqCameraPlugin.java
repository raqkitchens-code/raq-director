package com.raqkitchens.director;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.util.Log;
import android.util.Size;
import android.util.SizeF;
import android.view.Surface;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.camera.camera2.interop.Camera2CameraInfo;
import androidx.camera.camera2.interop.Camera2Interop;
import androidx.camera.camera2.interop.ExperimentalCamera2Interop;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraInfo;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.FocusMeteringAction;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.MeteringPoint;
import androidx.camera.core.Preview;
import androidx.camera.core.ZoomState;
import androidx.camera.core.resolutionselector.AspectRatioStrategy;
import androidx.camera.core.resolutionselector.ResolutionSelector;
import androidx.camera.core.resolutionselector.ResolutionStrategy;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.video.FallbackStrategy;
import androidx.camera.video.FileOutputOptions;
import androidx.camera.video.Quality;
import androidx.camera.video.QualitySelector;
import androidx.camera.video.Recorder;
import androidx.camera.video.PendingRecording;
import androidx.camera.video.Recording;
import androidx.camera.video.VideoCapture;
import androidx.camera.video.VideoRecordEvent;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The phone's real camera for the director: every lens (through zoom on the
 * logical camera, or a separate or physical camera), recording straight into
 * the gallery, a small grayscale copy of the picture for the framing checks,
 * spoken Arabic and vibration. Nothing here sends data off the phone.
 */
@CapacitorPlugin(
    name = "RaqCamera",
    permissions = {
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera"),
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
@OptIn(markerClass = ExperimentalCamera2Interop.class)
public class RaqCameraPlugin extends Plugin {

    private static final String TAG = "RaqCamera";
    private static final int AW = 90;
    private static final int AH = 160;
    private static final long FRAME_EVERY_MS = 160;

    private ProcessCameraProvider provider;
    private PreviewView previewView;
    private Camera camera;
    private VideoCapture<Recorder> videoCapture;
    private Recording recording;
    private PluginCall stopCall;
    private File recordingFile;
    private long recordingStarted;
    private final ExecutorService analysisExecutor = Executors.newSingleThreadExecutor();
    private long lastFrameAt = 0;

    private String facing = "back";
    private String lens = "1";
    private String lensMode = "zoom";
    private String boundCameraId = null;
    /** A back camera the person chose as the wide lens on the lens page. */
    private String wideCameraId = null;

    private TextToSpeech tts;
    private boolean ttsArabic = false;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), status -> {
            if (status != TextToSpeech.SUCCESS) return;
            int r = tts.setLanguage(new Locale("ar", "EG"));
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                r = tts.setLanguage(new Locale("ar"));
            }
            ttsArabic = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) tts.shutdown();
        analysisExecutor.shutdown();
    }

    // ---------- Permissions ----------

    private boolean hasPermissions() {
        return getPermissionState("camera") == PermissionState.GRANTED
            && getPermissionState("microphone") == PermissionState.GRANTED;
    }

    @PermissionCallback
    private void startAfterPermission(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("camera permission denied", "NotAllowedError");
            return;
        }
        doStart(call);
    }

    // ---------- Preview and lenses ----------

    @PluginMethod
    public void start(PluginCall call) {
        if (!hasPermissions()) {
            requestAllPermissions(call, "startAfterPermission");
            return;
        }
        doStart(call);
    }

    private void doStart(PluginCall call) {
        facing = call.getString("facing", "back");
        lens = call.getString("lens", "1");
        wideCameraId = call.getString("wideCameraId", null);
        getActivity().runOnUiThread(() -> {
            ensurePreviewView();
            placePreview(call.getObject("rect", null));
            previewView.setVisibility(View.VISIBLE);
            withProvider(call, () -> {
                try {
                    JSObject r = bindForLens();
                    call.resolve(r);
                } catch (Exception e) {
                    Log.e(TAG, "bind failed", e);
                    call.reject("camera failed: " + e.getMessage(), "NotReadableError");
                }
            });
        });
    }

    @PluginMethod
    public void setPreview(PluginCall call) {
        boolean visible = call.getBoolean("visible", true);
        JSObject rect = call.getObject("rect", null);
        getActivity().runOnUiThread(() -> {
            if (previewView == null) {
                call.resolve();
                return;
            }
            if (rect != null) placePreview(rect);
            previewView.setVisibility(visible ? View.VISIBLE : View.INVISIBLE);
            call.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (recording != null) {
                recording.stop();
                recording = null;
            }
            if (provider != null) provider.unbindAll();
            camera = null;
            videoCapture = null;
            if (previewView != null) previewView.setVisibility(View.GONE);
            call.resolve();
        });
    }

    private void withProvider(PluginCall call, Runnable then) {
        if (provider != null) {
            then.run();
            return;
        }
        ListenableFuture<ProcessCameraProvider> f = ProcessCameraProvider.getInstance(getContext());
        f.addListener(() -> {
            try {
                provider = f.get();
                then.run();
            } catch (Exception e) {
                call.reject("camera provider failed: " + e.getMessage(), "NotReadableError");
            }
        }, ContextCompat.getMainExecutor(getContext()));
    }

    private void ensurePreviewView() {
        if (previewView != null) return;
        WebView web = getBridge().getWebView();
        ViewGroup parent = (ViewGroup) web.getParent();
        previewView = new PreviewView(getContext());
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        // TextureView so the web page can be drawn on top of it.
        previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        parent.addView(previewView, 0, new ViewGroup.LayoutParams(1, 1));
        parent.setBackgroundColor(Color.BLACK);
        web.setBackgroundColor(Color.TRANSPARENT);
    }

    /** rect is in CSS pixels of the web page. */
    private void placePreview(JSObject rect) {
        if (rect == null || previewView == null) return;
        WebView web = getBridge().getWebView();
        float d = getContext().getResources().getDisplayMetrics().density;
        int w = Math.max(1, Math.round((float) rect.optDouble("w", 1) * d));
        int h = Math.max(1, Math.round((float) rect.optDouble("h", 1) * d));
        ViewGroup.LayoutParams lp = previewView.getLayoutParams();
        lp.width = w;
        lp.height = h;
        previewView.setLayoutParams(lp);
        previewView.setX(web.getX() + (float) rect.optDouble("x", 0) * d);
        previewView.setY(web.getY() + (float) rect.optDouble("y", 0) * d);
    }

    private static float ratioFor(String lens) {
        switch (lens) {
            case "0.6": return 0.6f;
            case "2": return 2f;
            case "3": return 3f;
            default: return 1f;
        }
    }

    /**
     * Picks how to reach the asked lens:
     *  1. zoom on the main (logical) camera when its range covers it — Samsung opens the
     *     ultra-wide this way below 1x;
     *  2. a separate back camera with a wider view;
     *  3. a physical camera behind the logical one.
     */
    private JSObject bindForLens() {
        if ("front".equals(facing)) {
            bind(CameraSelector.DEFAULT_FRONT_CAMERA, null);
            lensMode = "front";
            return state();
        }
        float want = ratioFor(lens);
        bind(CameraSelector.DEFAULT_BACK_CAMERA, null);
        ZoomState z = camera.getCameraInfo().getZoomState().getValue();
        float min = z != null ? z.getMinZoomRatio() : 1f;
        if (want >= 1f || min <= want + 0.05f) {
            camera.getCameraControl().setZoomRatio(Math.max(min, want));
            lensMode = "zoom";
            return state();
        }
        // Wide asked, main camera cannot zoom out: look for a wider camera.
        LensInfo main = describe(boundCameraId);
        LensInfo best = null;
        for (CameraInfo info : provider.getAvailableCameraInfos()) {
            if (info.getLensFacing() != CameraSelector.LENS_FACING_BACK) continue;
            String id = Camera2CameraInfo.from(info).getCameraId();
            if (id.equals(boundCameraId)) continue;
            LensInfo li = describe(id);
            if (li != null && main != null && li.fov > main.fov * 1.15 && (best == null || li.fov > best.fov)) best = li;
        }
        // A camera picked by hand on the lens page wins over the automatic choice.
        String pick = wideCameraId != null && !wideCameraId.equals(boundCameraId) ? wideCameraId : (best != null ? best.id : null);
        if (pick != null) {
            try {
                bind(selectorFor(pick), null);
                lensMode = "camera";
                watchForOpenError();
                return state();
            } catch (Exception e) {
                // Some phones list a lens they will not open for apps; stay on the main one.
                Log.w(TAG, "wide camera " + pick + " failed", e);
                bind(CameraSelector.DEFAULT_BACK_CAMERA, null);
            }
        }
        String physical = widestPhysical(boundCameraId, main);
        if (physical != null) {
            try {
                bind(CameraSelector.DEFAULT_BACK_CAMERA, physical);
                lensMode = "physical";
                return state();
            } catch (Exception e) {
                Log.w(TAG, "physical camera failed", e);
                bind(CameraSelector.DEFAULT_BACK_CAMERA, null);
            }
        }
        lensMode = "none";
        return state();
    }

    private void bind(CameraSelector selector, String physicalId) {
        provider.unbindAll();
        LifecycleOwner owner = (LifecycleOwner) getActivity();

        Preview.Builder pb = new Preview.Builder().setTargetRotation(Surface.ROTATION_0);
        ResolutionSelector analysisRes = new ResolutionSelector.Builder()
            .setAspectRatioStrategy(AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY)
            .setResolutionStrategy(new ResolutionStrategy(new Size(640, 360), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER))
            .build();
        ImageAnalysis.Builder ab = new ImageAnalysis.Builder()
            .setResolutionSelector(analysisRes)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setTargetRotation(Surface.ROTATION_0);
        if (physicalId != null) {
            new Camera2Interop.Extender<>(pb).setPhysicalCameraId(physicalId);
            new Camera2Interop.Extender<>(ab).setPhysicalCameraId(physicalId);
        }
        Preview preview = pb.build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());

        Recorder recorder = new Recorder.Builder()
            .setQualitySelector(QualitySelector.from(Quality.FHD, FallbackStrategy.lowerQualityOrHigherThan(Quality.FHD)))
            .build();
        VideoCapture<Recorder> vc = new VideoCapture.Builder<>(recorder).setTargetRotation(Surface.ROTATION_0).build();

        ImageAnalysis analysis = ab.build();
        analysis.setAnalyzer(analysisExecutor, this::analyze);

        try {
            camera = provider.bindToLifecycle(owner, selector, preview, vc, analysis);
        } catch (IllegalArgumentException e) {
            // Some cameras cannot run three streams at once: drop the framing checks first.
            Log.w(TAG, "3 streams not supported, binding without analysis", e);
            provider.unbindAll();
            camera = provider.bindToLifecycle(owner, selector, preview, vc);
        }
        videoCapture = vc;
        boundCameraId = Camera2CameraInfo.from(camera.getCameraInfo()).getCameraId();
    }

    /** If the separate wide camera fails after opening, go back to the main one and tell the page. */
    private void watchForOpenError() {
        final Camera watched = camera;
        watched.getCameraInfo().getCameraState().observe((LifecycleOwner) getActivity(), st -> {
            if (st.getError() == null || camera != watched || !"camera".equals(lensMode)) return;
            Log.w(TAG, "wide camera error " + st.getError().getCode());
            try {
                bind(CameraSelector.DEFAULT_BACK_CAMERA, null);
                lensMode = "none";
                notifyListeners("lens", state());
            } catch (Exception e) {
                Log.e(TAG, "fallback failed", e);
            }
        });
    }

    private static CameraSelector selectorFor(String id) {
        return new CameraSelector.Builder()
            .addCameraFilter(infos -> {
                List<CameraInfo> out = new ArrayList<>();
                for (CameraInfo i : infos) if (id.equals(Camera2CameraInfo.from(i).getCameraId())) out.add(i);
                return out;
            })
            .build();
    }

    private JSObject state() {
        JSObject r = new JSObject();
        r.put("facing", facing);
        r.put("lens", lens);
        r.put("mode", lensMode);
        r.put("cameraId", boundCameraId);
        ZoomState z = camera.getCameraInfo().getZoomState().getValue();
        if (z != null) {
            r.put("zoom", z.getZoomRatio());
            r.put("zoomMin", z.getMinZoomRatio());
            r.put("zoomMax", z.getMaxZoomRatio());
        }
        r.put("torch", camera.getCameraInfo().hasFlashUnit());
        return r;
    }

    @PluginMethod
    public void setZoom(PluginCall call) {
        float ratio = call.getFloat("ratio", 1f);
        getActivity().runOnUiThread(() -> {
            if (camera == null) {
                call.reject("no camera");
                return;
            }
            ZoomState z = camera.getCameraInfo().getZoomState().getValue();
            float v = ratio;
            if (z != null) v = Math.max(z.getMinZoomRatio(), Math.min(z.getMaxZoomRatio(), ratio));
            camera.getCameraControl().setZoomRatio(v);
            JSObject r = new JSObject();
            r.put("zoom", v);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void setTorch(PluginCall call) {
        boolean on = call.getBoolean("on", false);
        getActivity().runOnUiThread(() -> {
            if (camera == null || !camera.getCameraInfo().hasFlashUnit()) {
                call.reject("no torch");
                return;
            }
            camera.getCameraControl().enableTorch(on);
            call.resolve();
        });
    }

    /** x, y are 0..1 inside the preview. */
    @PluginMethod
    public void focus(PluginCall call) {
        float x = call.getFloat("x", 0.5f);
        float y = call.getFloat("y", 0.5f);
        getActivity().runOnUiThread(() -> {
            if (camera == null || previewView == null) {
                call.resolve();
                return;
            }
            MeteringPoint p = previewView.getMeteringPointFactory()
                .createPoint(x * previewView.getWidth(), y * previewView.getHeight());
            camera.getCameraControl().startFocusAndMetering(new FocusMeteringAction.Builder(p).build());
            call.resolve();
        });
    }

    // ---------- Frame analysis ----------

    /** Sends a 90x160 portrait grayscale copy, cropped like the preview, a few times a second. */
    private void analyze(@NonNull ImageProxy image) {
        try {
            long now = SystemClock.elapsedRealtime();
            if (now - lastFrameAt < FRAME_EVERY_MS || !hasListeners("frame")) return;
            lastFrameAt = now;
            ImageProxy.PlaneProxy plane = image.getPlanes()[0];
            ByteBuffer buf = plane.getBuffer();
            int rowStride = plane.getRowStride();
            int pixStride = plane.getPixelStride();
            int sw = image.getWidth();
            int sh = image.getHeight();
            int rot = image.getImageInfo().getRotationDegrees();
            // Size of the picture as shown (after rotation).
            int dw = (rot == 90 || rot == 270) ? sh : sw;
            int dh = (rot == 90 || rot == 270) ? sw : sh;
            // Centre crop to 9:16 like the preview's fill-centre.
            float target = (float) AW / AH;
            float cw = dw;
            float ch = dh;
            if ((float) dw / dh > target) cw = dh * target;
            else ch = dw / target;
            float ox = (dw - cw) / 2f;
            float oy = (dh - ch) / 2f;
            byte[] out = new byte[AW * AH];
            for (int y = 0; y < AH; y++) {
                int dy = (int) (oy + (y + 0.5f) * ch / AH);
                for (int x = 0; x < AW; x++) {
                    int dx = (int) (ox + (x + 0.5f) * cw / AW);
                    int sx;
                    int sy;
                    switch (rot) {
                        case 90: sx = dy; sy = sh - 1 - dx; break;
                        case 180: sx = sw - 1 - dx; sy = sh - 1 - dy; break;
                        case 270: sx = sw - 1 - dy; sy = dx; break;
                        default: sx = dx; sy = dy;
                    }
                    sx = Math.max(0, Math.min(sw - 1, sx));
                    sy = Math.max(0, Math.min(sh - 1, sy));
                    out[y * AW + x] = buf.get(sy * rowStride + sx * pixStride);
                }
            }
            JSObject f = new JSObject();
            f.put("w", AW);
            f.put("h", AH);
            f.put("luma", Base64.encodeToString(out, Base64.NO_WRAP));
            notifyListeners("frame", f);
        } catch (Exception e) {
            Log.w(TAG, "analyze failed", e);
        } finally {
            image.close();
        }
    }

    // ---------- Recording ----------

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void startRecording(PluginCall call) {
        String name = call.getString("name", "take-" + System.currentTimeMillis());
        getActivity().runOnUiThread(() -> {
            if (videoCapture == null) {
                call.reject("camera not started");
                return;
            }
            if (recording != null) {
                call.reject("already recording");
                return;
            }
            File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_MOVIES);
            if (dir == null) dir = getContext().getFilesDir();
            recordingFile = new File(dir, safeName(name) + ".mp4");
            FileOutputOptions opts = new FileOutputOptions.Builder(recordingFile).build();
            PendingRecording pending = videoCapture.getOutput().prepareRecording(getContext(), opts);
            if (getPermissionState("microphone") == PermissionState.GRANTED) pending = pending.withAudioEnabled();
            recording = pending.start(ContextCompat.getMainExecutor(getContext()), this::onRecordEvent);
            recordingStarted = SystemClock.elapsedRealtime();
            call.resolve();
        });
    }

    @PluginMethod
    public void stopRecording(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (recording == null) {
                call.reject("not recording");
                return;
            }
            call.setKeepAlive(true);
            stopCall = call;
            recording.stop();
            recording = null;
        });
    }

    private void onRecordEvent(VideoRecordEvent event) {
        if (!(event instanceof VideoRecordEvent.Finalize)) return;
        VideoRecordEvent.Finalize fin = (VideoRecordEvent.Finalize) event;
        PluginCall call = stopCall;
        stopCall = null;
        if (call == null) return;
        call.setKeepAlive(false);
        if (fin.hasError() && fin.getError() != VideoRecordEvent.Finalize.ERROR_DURATION_LIMIT_REACHED
            && (recordingFile == null || !recordingFile.exists() || recordingFile.length() == 0)) {
            call.reject("recording failed: " + fin.getError());
            return;
        }
        long durationMs = fin.getRecordingStats().getRecordedDurationNanos() / 1_000_000L;
        if (durationMs <= 0) durationMs = SystemClock.elapsedRealtime() - recordingStarted;
        JSObject r = new JSObject();
        r.put("path", recordingFile.getAbsolutePath());
        r.put("size", recordingFile.length());
        r.put("durationMs", durationMs);
        try {
            Uri g = copyToGallery(recordingFile);
            r.put("galleryUri", g.toString());
        } catch (Exception e) {
            Log.e(TAG, "gallery copy failed", e);
            r.put("galleryError", String.valueOf(e.getMessage()));
        }
        call.resolve(r);
    }

    private static String safeName(String s) {
        return s.replaceAll("[^A-Za-z0-9._-]", "_");
    }

    /** Saves the take into the phone's gallery under Movies/RAQ. */
    private Uri copyToGallery(File f) throws Exception {
        ContentResolver cr = getContext().getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.Video.Media.DISPLAY_NAME, f.getName());
        v.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
        v.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/RAQ");
        v.put(MediaStore.Video.Media.IS_PENDING, 1);
        Uri uri = cr.insert(MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
        if (uri == null) throw new IllegalStateException("insert returned null");
        try (InputStream in = new FileInputStream(f); OutputStream out = cr.openOutputStream(uri)) {
            if (out == null) throw new IllegalStateException("no output stream");
            byte[] b = new byte[1 << 16];
            int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
        }
        ContentValues done = new ContentValues();
        done.put(MediaStore.Video.Media.IS_PENDING, 0);
        cr.update(uri, done, null, null);
        return uri;
    }

    /** Removes the working copy, and the gallery copy when asked. */
    @PluginMethod
    public void deleteTake(PluginCall call) {
        String path = call.getString("path");
        String gallery = call.getString("galleryUri");
        boolean ok = true;
        if (path != null) {
            File f = new File(path);
            if (f.exists()) ok = f.delete();
        }
        if (gallery != null) {
            try {
                getContext().getContentResolver().delete(Uri.parse(gallery), null, null);
            } catch (Exception e) {
                Log.w(TAG, "gallery delete failed", e);
                ok = false;
            }
        }
        JSObject r = new JSObject();
        r.put("ok", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void openInGallery(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("no uri");
            return;
        }
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(Uri.parse(uri), "video/mp4");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("no viewer");
        }
    }

    @PluginMethod
    public void share(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("no uri");
            return;
        }
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("video/mp4");
        send.putExtra(Intent.EXTRA_STREAM, Uri.parse(uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, null);
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(chooser);
        call.resolve();
    }

    /** A small JPEG of what the preview shows, for posters and reference frames. */
    @PluginMethod
    public void snapshot(PluginCall call) {
        int width = call.getInt("width", 270);
        getActivity().runOnUiThread(() -> {
            Bitmap b = previewView != null ? previewView.getBitmap() : null;
            JSObject r = new JSObject();
            if (b == null) {
                r.put("dataUrl", "");
                call.resolve(r);
                return;
            }
            int h = Math.round((float) width * b.getHeight() / b.getWidth());
            Bitmap s = Bitmap.createScaledBitmap(b, width, h, true);
            java.io.ByteArrayOutputStream os = new java.io.ByteArrayOutputStream();
            s.compress(Bitmap.CompressFormat.JPEG, 70, os);
            r.put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(os.toByteArray(), Base64.NO_WRAP));
            call.resolve(r);
        });
    }

    // ---------- Lens report ----------

    private static class LensInfo {
        String id;
        String facing;
        float focal;
        float fov;
    }

    private LensInfo describe(String id) {
        if (id == null) return null;
        try {
            CameraManager cm = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            CameraCharacteristics c = cm.getCameraCharacteristics(id);
            float[] focals = c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
            SizeF sensor = c.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE);
            Integer f = c.get(CameraCharacteristics.LENS_FACING);
            LensInfo li = new LensInfo();
            li.id = id;
            li.facing = f != null && f == CameraCharacteristics.LENS_FACING_FRONT ? "front" : "back";
            li.focal = focals != null && focals.length > 0 ? focals[0] : 0;
            float sw = sensor != null ? Math.max(sensor.getWidth(), sensor.getHeight()) : 0;
            li.fov = li.focal > 0 && sw > 0 ? (float) Math.toDegrees(2 * Math.atan(sw / (2 * li.focal))) : 0;
            return li;
        } catch (Exception e) {
            return null;
        }
    }

    private String widestPhysical(String logicalId, LensInfo main) {
        if (logicalId == null || main == null) return null;
        try {
            CameraManager cm = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            Set<String> ids = cm.getCameraCharacteristics(logicalId).getPhysicalCameraIds();
            LensInfo best = null;
            for (String pid : ids) {
                LensInfo li = describe(pid);
                if (li != null && li.fov > main.fov * 1.15 && (best == null || li.fov > best.fov)) best = li;
            }
            return best != null ? best.id : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** Every camera the app can see, with its view angle and zoom range, for the lens page. */
    @PluginMethod
    public void lenses(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "lensesAfterPermission");
            return;
        }
        lensesAfterPermission(call);
    }

    @PermissionCallback
    private void lensesAfterPermission(PluginCall call) {
        getActivity().runOnUiThread(() -> withProvider(call, () -> {
            JSArray list = new JSArray();
            try {
                CameraManager cm = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
                for (CameraInfo info : provider.getAvailableCameraInfos()) {
                    String id = Camera2CameraInfo.from(info).getCameraId();
                    LensInfo li = describe(id);
                    JSObject o = new JSObject();
                    o.put("id", id);
                    o.put("facing", li != null ? li.facing : "back");
                    o.put("focal", li != null ? li.focal : 0);
                    o.put("fov", li != null ? Math.round(li.fov) : 0);
                    ZoomState z = info.getZoomState().getValue();
                    if (z != null) {
                        o.put("zoomMin", z.getMinZoomRatio());
                        o.put("zoomMax", z.getMaxZoomRatio());
                    }
                    JSArray phys = new JSArray();
                    for (String pid : cm.getCameraCharacteristics(id).getPhysicalCameraIds()) {
                        LensInfo p = describe(pid);
                        JSObject po = new JSObject();
                        po.put("id", pid);
                        po.put("fov", p != null ? Math.round(p.fov) : 0);
                        phys.put(po);
                    }
                    o.put("physical", phys);
                    list.put(o);
                }
            } catch (Exception e) {
                Log.w(TAG, "lens report failed", e);
            }
            JSObject r = new JSObject();
            r.put("cameras", list);
            call.resolve(r);
        }));
    }

    // ---------- Voice and vibration ----------

    @PluginMethod
    public void voice(PluginCall call) {
        JSObject r = new JSObject();
        r.put("arabic", ttsArabic);
        call.resolve(r);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        JSObject r = new JSObject();
        if (tts == null || !ttsArabic || text.isEmpty()) {
            r.put("spoken", false);
            call.resolve(r);
            return;
        }
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "raq");
        r.put("spoken", true);
        call.resolve(r);
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }

    @PluginMethod
    public void vibrate(PluginCall call) {
        JSArray pattern = call.getArray("pattern", new JSArray());
        long[] timings;
        try {
            // Web pattern is on, off, on...; Android's starts with an off time.
            timings = new long[pattern.length() + 1];
            for (int i = 0; i < pattern.length(); i++) timings[i + 1] = pattern.getLong(i);
        } catch (Exception e) {
            timings = new long[] { 0, 60 };
        }
        Vibrator v;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) getContext().getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            v = vm.getDefaultVibrator();
        } else {
            v = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
        }
        if (v != null && v.hasVibrator() && timings.length > 1) v.vibrate(VibrationEffect.createWaveform(timings, -1));
        call.resolve();
    }
}
