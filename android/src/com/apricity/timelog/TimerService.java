package com.apricity.timelog;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.widget.RemoteViews;

public class TimerService extends Service {

    static final String CH = "timer_state_v2";
    static final int NID = 1001;

    private final Handler h = new Handler(Looper.getMainLooper());
    private long baseElapsed = 0;     // 解析那一刻的有效时长
    private long monoAtParse = 0;     // 解析时的单调时钟
    private long pausedAt = 0;        // 暂停开始（墙钟），0 表示运行中
    private String label = "计时中";
    private boolean dark = false;
    private boolean running = false;
    private SharedPreferences sp;

    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            if (!running) return;
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) {
                try { nm.notify(NID, build()); } catch (Exception ignored) {}
            }
            h.postDelayed(this, 10000);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        sp = getSharedPreferences("timer_state", MODE_PRIVATE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel c = new NotificationChannel(CH, "计时状态", NotificationManager.IMPORTANCE_DEFAULT);
            c.setShowBadge(false);
            c.setSound(null, null);
            c.enableVibration(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(c);
        }
    }

    @Override
    public int onStartCommand(Intent it, int flags, int startId) {
        String payload = it != null ? it.getStringExtra("sync") : null;

        if (payload != null) {
            if (payload.isEmpty() || !parse(payload)) { stopAll(); return START_NOT_STICKY; }
            sp.edit().putString("payload", payload).apply();
            running = true;
        } else {
            // 服务被系统重建：接着上次的状态，避免出现空白或 00:00:00 的通知
            String saved = sp.getString("payload", "");
            if (saved == null || saved.isEmpty() || !parse(saved)) { stopAll(); return START_NOT_STICKY; }
            running = true;
        }

        startForegroundNow();   // 一次就发真实数据，不再先发占位通知
        scheduleTick();
        return START_NOT_STICKY;
    }

    @Override public IBinder onBind(Intent it) { return null; }

    @Override
    public void onTaskRemoved(Intent root) {
        stopAll();
        super.onTaskRemoved(root);
    }

    @Override
    public void onDestroy() {
        h.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private void stopAll() {
        running = false;
        h.removeCallbacksAndMessages(null);
        if (sp != null) sp.edit().remove("payload").apply();
        try { stopForeground(true); } catch (Exception ignored) {}
        stopSelf();
    }

    private void startForegroundNow() {
        Notification n = build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NID, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NID, n);
        }
    }

    private void scheduleTick() {
        h.removeCallbacksAndMessages(null);
        h.post(ticker);
    }

    /** 格式：start;pausedTotal;pausedAt;label */
    private boolean parse(String s) {
        String[] p = s.split(";", -1);
        long startMs, pausedTotal;
        try {
            startMs = Long.parseLong(p[0].trim());
            pausedTotal = Long.parseLong(p[1].trim());
            pausedAt = Long.parseLong(p[2].trim());
        } catch (Exception e) {
            return false;
        }
        label = p.length > 3 ? p[3] : "计时中";
        dark = p.length > 4 && "D".equalsIgnoreCase(p[4].trim());
        long nowWall = System.currentTimeMillis();
        long livePause = pausedAt > 0 ? Math.max(0, nowWall - pausedAt) : 0;
        baseElapsed = Math.max(0, nowWall - startMs - pausedTotal - livePause);
        monoAtParse = SystemClock.elapsedRealtime();
        return true;
    }

    /** 用单调时钟推进，改系统时间不会算错 */
    private long elapsed() {
        if (pausedAt > 0) return baseElapsed;
        return Math.max(0, baseElapsed + (SystemClock.elapsedRealtime() - monoAtParse));
    }

    static String fmt(long ms) {
        long t = ms / 1000;
        return String.format("%02d:%02d:%02d", t / 3600, (t / 60) % 60, t % 60);
    }

    private Notification build() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open,
                Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        long ms = elapsed();
        boolean paused = pausedAt > 0;
        String state = paused ? " 已暂停" : " 进行中";

        RemoteViews rv = new RemoteViews(getPackageName(),
                dark ? R.layout.notif_timer_dark : R.layout.notif_timer);
        rv.setTextViewText(R.id.n_title, label + state);
        // 大号时间：交给系统 Chronometer 渲染，打开通知栏时不会跳变
        rv.setChronometer(R.id.n_time, SystemClock.elapsedRealtime() - ms, null, !paused);

        b.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(label + state)
                .setContentText(fmt(ms))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(pi)
                .setShowWhen(false)
                .setCustomContentView(rv)
                .setCustomBigContentView(rv);
        return b.build();
    }
}
