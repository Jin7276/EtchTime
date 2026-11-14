package com.apricity.timelog;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

public class TimerService extends Service {

    static final String CH = "timer_state";
    static final int NID = 1001;

    private final Handler h = new Handler(Looper.getMainLooper());
    private long startMs = 0, pausedTotal = 0, pausedAt = 0;
    private String label = "计时中";
    private boolean running = false;

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel c = new NotificationChannel(CH, "计时状态", NotificationManager.IMPORTANCE_LOW);
            c.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(c);
        }
    }

    @Override
    public int onStartCommand(Intent it, int flags, int startId) {
        Notification n0 = buildNotification("计时中", "00:00:00");
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NID, n0, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NID, n0);
        }
        if (it != null) {
            String payload = it.getStringExtra("sync");
            if (payload != null && !payload.isEmpty()) sync(payload);
        }
        if (!running) { stopForeground(true); stopSelf(); }
        return START_NOT_STICKY;
    }

    @Override public IBinder onBind(Intent it) { return null; }

    /** 用户把 App 从后台划掉时，安静地结束服务，不弹任何提示 */
    @Override
    public void onTaskRemoved(Intent root) {
        h.removeCallbacksAndMessages(null);
        stopForeground(true);
        stopSelf();
        super.onTaskRemoved(root);
    }

    @Override
    public void onDestroy() {
        h.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    /** 格式：start;pausedTotal;pausedAt;label */
    void sync(String s) {
        if (s == null || s.isEmpty()) {
            running = false;
            h.removeCallbacksAndMessages(null);
            stopForeground(true);
            stopSelf();
            return;
        }
        String[] p = s.split(";", -1);
        try {
            startMs = Long.parseLong(p[0].trim());
            pausedTotal = Long.parseLong(p[1].trim());
            pausedAt = Long.parseLong(p[2].trim());
        } catch (Exception e) { return; }
        label = p.length > 3 ? p[3] : "计时中";
        running = true;
        tick();
    }

    long elapsed() {
        long now = System.currentTimeMillis();
        long live = pausedAt > 0 ? now - pausedAt : 0;
        return Math.max(0, now - startMs - pausedTotal - live);
    }

    static String fmt(long ms) {
        long t = ms / 1000;
        return String.format("%02d:%02d:%02d", t / 3600, (t / 60) % 60, t % 60);
    }

    /** 用系统 Chronometer 走秒，不再每秒重建通知 */
    void tick() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NID, buildNotification(label + " 进行中", fmt(elapsed())));
    }

    Notification buildNotification(String title, String time) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open,
                Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        b.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(time)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(pi);
        if (pausedAt > 0) {
            b.setShowWhen(false);
        } else {
            b.setUsesChronometer(true);
            b.setWhen(System.currentTimeMillis() - elapsed());
            b.setShowWhen(true);
        }
        return b.build();
    }
}
