package app.poneleplay.tv.updater

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

data class AppUpdateInfo(
    val versionCode: Int,
    val versionName: String,
    val apkUrl: String,
    val releaseNotes: String?,
    val mandatory: Boolean = false
)

object TvAppUpdater {

    suspend fun checkForUpdate(
        serverUrl: String,
        currentVersionCode: Int
    ): Result<AppUpdateInfo?> = withContext(Dispatchers.IO) {
        try {
            val endpoint = "${serverUrl.trimEnd('/')}/api/tv/version"
            val url = URL(endpoint)
            val conn = url.openConnection() as HttpURLConnection
            conn.connectTimeout = 5000
            conn.readTimeout = 5000
            conn.requestMethod = "GET"
            conn.setRequestProperty("Accept", "application/json")

            if (conn.responseCode in 200..299) {
                val jsonStr = conn.inputStream.bufferedReader().use { it.readText() }
                conn.disconnect()

                val obj = JSONObject(jsonStr)
                if (obj.optBoolean("ok", true)) {
                    val remoteVersionCode = obj.optInt("versionCode", 0)
                    val remoteVersionName = obj.optString("versionName", "")
                    val apkUrl = obj.optString("apkUrl", "")
                    val notes = obj.optString("releaseNotes", "")
                    val mandatory = obj.optBoolean("mandatory", false)

                    if (remoteVersionCode > currentVersionCode && apkUrl.isNotBlank()) {
                        return@withContext Result.success(
                            AppUpdateInfo(
                                versionCode = remoteVersionCode,
                                versionName = remoteVersionName.ifBlank { "v$remoteVersionCode" },
                                apkUrl = apkUrl,
                                releaseNotes = notes.ifBlank { null },
                                mandatory = mandatory
                            )
                        )
                    }
                }
                return@withContext Result.success(null)
            } else {
                conn.disconnect()
                return@withContext Result.failure(Exception("HTTP ${conn.responseCode} al buscar actualizaciones"))
            }
        } catch (e: Exception) {
            return@withContext Result.failure(e)
        }
    }

    suspend fun downloadApk(
        context: Context,
        apkUrl: String,
        onProgress: (progress: Float, downloadedBytes: Long, totalBytes: Long) -> Unit
    ): Result<File> = withContext(Dispatchers.IO) {
        try {
            val url = URL(apkUrl)
            val conn = url.openConnection() as HttpURLConnection
            conn.connectTimeout = 8000
            conn.readTimeout = 20000
            conn.requestMethod = "GET"

            if (conn.responseCode !in 200..299) {
                conn.disconnect()
                return@withContext Result.failure(Exception("Error HTTP ${conn.responseCode} al descargar el archivo"))
            }

            val totalBytes = conn.contentLength.toLong()
            val outputFile = File(context.cacheDir, "poneleplay-tv-update.apk")
            if (outputFile.exists()) {
                outputFile.delete()
            }

            conn.inputStream.use { input ->
                FileOutputStream(outputFile).use { output ->
                    val buffer = ByteArray(8 * 1024)
                    var bytesRead: Int
                    var downloaded: Long = 0

                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        downloaded += bytesRead
                        val progress = if (totalBytes > 0) downloaded.toFloat() / totalBytes.toFloat() else 0.5f
                        onProgress(progress.coerceIn(0f, 1f), downloaded, totalBytes)
                    }
                    output.flush()
                }
            }
            conn.disconnect()

            return@withContext Result.success(outputFile)
        } catch (e: Exception) {
            return@withContext Result.failure(e)
        }
    }

    fun installApk(context: Context, apkFile: File): Result<Unit> {
        try {
            if (!apkFile.exists() || apkFile.length() <= 0) {
                return Result.failure(Exception("El archivo APK no se descargó correctamente."))
            }

            // Android O+ (API 26+) unknown sources permission check
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!context.packageManager.canRequestPackageInstalls()) {
                    val manageIntent = Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${context.packageName}")
                    ).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(manageIntent)
                    return Result.failure(Exception("Se requiere autorizar 'Instalar apps desconocidas' para PonelePlay TV en los ajustes del televisor."))
                }
            }

            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apkFile
            )

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            context.startActivity(installIntent)
            return Result.success(Unit)
        } catch (e: Exception) {
            return Result.failure(e)
        }
    }
}

