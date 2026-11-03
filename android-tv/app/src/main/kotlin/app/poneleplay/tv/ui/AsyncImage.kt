package app.poneleplay.tv.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

private val imageCache = object : LruCache<String, Bitmap>(30) {}

@Composable
fun AsyncThumbnail(
    url: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop
) {
    var bitmap by remember(url) { mutableStateOf(url?.let { imageCache.get(it) }) }

    LaunchedEffect(url) {
        if (url.isNullOrBlank()) {
            bitmap = null
            return@LaunchedEffect
        }
        if (imageCache.get(url) != null) {
            bitmap = imageCache.get(url)
            return@LaunchedEffect
        }

        withContext(Dispatchers.IO) {
            try {
                val conn = URL(url).openConnection() as HttpURLConnection
                conn.connectTimeout = 4000
                conn.readTimeout = 4000
                conn.doInput = true
                conn.connect()
                val input = conn.inputStream
                val bmp = BitmapFactory.decodeStream(input)
                input.close()
                if (bmp != null) {
                    imageCache.put(url, bmp)
                    withContext(Dispatchers.Main) {
                        bitmap = bmp
                    }
                }
            } catch (_: Exception) {
                // Fallback to placeholder
            }
        }
    }

    if (bitmap != null) {
        Image(
            bitmap = bitmap!!.asImageBitmap(),
            contentDescription = null,
            modifier = modifier,
            contentScale = contentScale
        )
    } else {
        Box(
            modifier = modifier
                .background(Color(0xFF1E2333))
        )
    }
}

