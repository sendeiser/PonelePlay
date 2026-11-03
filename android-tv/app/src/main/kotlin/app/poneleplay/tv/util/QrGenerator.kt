package app.poneleplay.tv.util

import android.graphics.Bitmap
import android.graphics.Color
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.util.EnumMap

object QrGenerator {
    private val cache = mutableMapOf<String, Bitmap>()

    fun generate(content: String, sizePx: Int = 360): Bitmap? {
        if (content.isBlank()) return null
        val cacheKey = "$content:$sizePx"
        cache[cacheKey]?.let { return it }

        return try {
            val hints = EnumMap<EncodeHintType, Any>(EncodeHintType::class.java).apply {
                put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M)
                put(EncodeHintType.MARGIN, 1)
                put(EncodeHintType.CHARACTER_SET, "UTF-8")
            }

            val writer = QRCodeWriter()
            val bitMatrix = writer.encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx, hints)
            val width = bitMatrix.width
            val height = bitMatrix.height
            val pixels = IntArray(width * height)

            val darkColor = Color.rgb(10, 14, 23) // Deep dark nocturne
            val lightColor = Color.rgb(255, 255, 255)

            for (y in 0 until height) {
                val offset = y * width
                for (x in 0 until width) {
                    pixels[offset + x] = if (bitMatrix.get(x, y)) darkColor else lightColor
                }
            }

            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            bitmap.setPixels(pixels, 0, width, 0, 0, width, height)

            if (cache.size > 20) cache.clear()
            cache[cacheKey] = bitmap
            bitmap
        } catch (_: Exception) {
            null
        }
    }
}
