import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import sharp from 'sharp'

export const dynamic = 'force-dynamic'

// Initialize OpenAI
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null

// Rate limiting configuration
const RATE_LIMIT = {
  maxRequestsPerMinute: 2,  // Very strict limit for image editing (expensive operation)
  resetTimeMinutes: 1
}

// Simple in-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const userLimit = rateLimitMap.get(ip)

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + (RATE_LIMIT.resetTimeMinutes * 60000) })
    return true
  }

  if (userLimit.count >= RATE_LIMIT.maxRequestsPerMinute) {
    return false
  }

  userLimit.count++
  return true
}

/**
 * Create a mask for DALL-E 2 image editing
 * Protects the subject (center area) and allows editing of background (outer areas)
 */
async function createBackgroundMask(width: number = 512, height: number = 512): Promise<Buffer> {
  try {
    // Create a mask where:
    // - White (255) = protected area (subject/face)
    // - Black (0) = area to be edited (background)
    
    const centerX = width / 2
    const centerY = height / 2
    const protectedRadiusX = width * 0.25  // Protect 50% of width (25% radius from center) - less protection for more background editing
    const protectedRadiusY = height * 0.3  // Protect 60% of height (30% radius from center) - allow more background change
    
    // Create gradient mask with smooth falloff
    const maskData = new Uint8Array(width * height * 4) // RGBA
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        
        // Calculate distance from center (normalized ellipse)
        const normalizedX = (x - centerX) / protectedRadiusX
        const normalizedY = (y - centerY) / protectedRadiusY
        const distance = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY)
        
        let alpha
        if (distance <= 1.0) {
          // Inside protected ellipse - white (protected)
          alpha = 255
        } else if (distance <= 1.3) {
          // Smooth transition zone
          const falloff = Math.max(0, (1.3 - distance) / 0.3)
          alpha = Math.floor(255 * falloff)
        } else {
          // Outside - black (editable)
          alpha = 0
        }
        
        // Set RGBA values (grayscale mask)
        maskData[idx] = alpha     // R
        maskData[idx + 1] = alpha // G
        maskData[idx + 2] = alpha // B
        maskData[idx + 3] = 255   // A (always opaque)
      }
    }
    
    // Convert to PNG buffer using Sharp
    const maskBuffer = await sharp(maskData, {
      raw: {
        width,
        height,
        channels: 4
      }
    }).png().toBuffer()
    
    return maskBuffer
  } catch (error) {
    console.error('Error creating mask:', error)
    throw new Error('Failed to create editing mask')
  }
}

/**
 * Prepare image for DALL-E 2 editing
 */
async function prepareImageForEditing(imageBuffer: Buffer): Promise<Buffer> {
  try {
    console.log('Processing image buffer, size:', imageBuffer.length)
    
    // Convert and resize image to PNG format (required for DALL-E 2)
    const processedBuffer = await sharp(imageBuffer)
      .resize(512, 512, { 
        fit: 'cover',
        position: 'center'
      })
      .removeAlpha() // Remove alpha channel to avoid transparency issues
      .png({ 
        quality: 100,
        compressionLevel: 0, // No compression to avoid artifacts
        progressive: false
      })
      .toBuffer()
    
    console.log('Image processed successfully, new size:', processedBuffer.length)
    return processedBuffer
  } catch (error) {
    console.error('Error preparing image:', error)
    throw new Error('Failed to prepare image for editing')
  }
}

/**
 * Generate professional edited photo using DALL-E 2 image editing
 */
async function generate_professional_edited_photo(
  imageFile: File,
  userDescriptionPrompt: string
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  if (!openai) {
    return { success: false, error: 'OpenAI API key not configured' }
  }

  try {
    console.log('Starting professional photo editing...')
    
    // Step 1: Prepare the original image
    const originalImageBuffer = Buffer.from(await imageFile.arrayBuffer())
    const preparedImage = await prepareImageForEditing(originalImageBuffer)
    
    console.log('Image prepared, creating mask...')
    
    // Step 2: Create mask that protects the subject
    const maskBuffer = await createBackgroundMask(512, 512)
    
    // Step 3: Build more specific and forceful prompt for visible changes
    const comprehensivePrompt = `Professional headshot photo editing. MUST change background completely. ${userDescriptionPrompt}. Remove all blue background. Make dramatic background change. Keep person's face, hair, and clothes exactly identical. High quality professional photo.`

    console.log('Sending request to DALL-E 2...')
    console.log('Image size:', preparedImage.length, 'bytes')
    console.log('Mask size:', maskBuffer.length, 'bytes')
    console.log('Prompt length:', comprehensivePrompt.length, 'characters')

    try {
      // Step 4: Call DALL-E 2 image editing API with proper File objects
      const imageArrayBuffer = new Uint8Array(preparedImage).buffer
      const maskArrayBuffer = new Uint8Array(maskBuffer).buffer
      
      const imageFile = new File([imageArrayBuffer], 'image.png', { type: 'image/png' })
      const maskFile = new File([maskArrayBuffer], 'mask.png', { type: 'image/png' })
      
      console.log('Creating DALL-E 2 request with files:', {
        imageSize: preparedImage.length,
        maskSize: maskBuffer.length,
        prompt: comprehensivePrompt
      })

      const response = await Promise.race([
        openai.images.edit({
          model: "dall-e-2",
          image: imageFile as any,
          mask: maskFile as any,
          prompt: comprehensivePrompt,
          size: "512x512",
          n: 1,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout after 60 seconds')), 60000)
        )
      ]) as any

      if (response.data && response.data.length > 0) {
        console.log('Professional photo editing successful')
        return { 
          success: true, 
          imageUrl: response.data[0].url 
        }
      } else {
        console.error('No data in OpenAI response:', response)
        return { 
          success: false, 
          error: 'No edited image generated' 
        }
      }

    } catch (apiError: any) {
      console.error('OpenAI API Error Details:', {
        message: apiError.message,
        status: apiError.status,
        code: apiError.code,
        type: apiError.type,
        error: apiError.error
      })

      // Handle specific OpenAI API errors
      let errorMessage = 'Gagal mengedit foto profesional'

      if (apiError.status) {
        switch (apiError.status) {
          case 400:
            console.error('Bad Request (400):', apiError.message)
            if (apiError.message?.includes('image must be a PNG') || apiError.message?.includes('PNG format')) {
              errorMessage = 'Error format PNG! Sistem sudah mengkonversi otomatis. Coba dengan foto yang berbeda.'
            } else if (apiError.message?.includes('less than 4 MB') || apiError.message?.includes('file size')) {
              errorMessage = 'Ukuran file terlalu besar! Maksimal 4MB. Silakan kompres foto Anda.'
            } else if (apiError.message?.includes('invalid image') || apiError.message?.includes('malformed')) {
              errorMessage = 'File gambar corrupt atau tidak valid! Coba dengan foto lain.'
            } else if (apiError.message?.includes('mask') || apiError.message?.includes('transparent')) {
              errorMessage = 'Error dengan mask editing. Coba dengan foto yang memiliki background jelas.'
            } else {
              errorMessage = `Format tidak valid: ${apiError.message}. Coba foto JPG/PNG yang fresh.`
            }
            break;

          case 401:
            console.error('Unauthorized (401) - API Key issue:', apiError.message)
            errorMessage = 'API key tidak valid atau habis kredit. Silakan hubungi administrator.'
            break;

          case 429:
            console.error('Rate Limited (429):', apiError.message)
            errorMessage = 'Terlalu banyak request. Silakan tunggu beberapa menit sebelum mencoba lagi.'
            break;

          case 500:
          case 502:
          case 503:
            console.error('Server Error (5xx):', apiError.message)
            errorMessage = 'Server OpenAI sedang bermasalah. Silakan coba lagi dalam beberapa menit.'
            break;

          default:
            console.error('Unknown API Error:', apiError.status, apiError.message)
            errorMessage = `Error API: ${apiError.status}. Silakan coba lagi atau hubungi support.`
        }
      } else if (apiError.message?.includes('timeout')) {
        console.error('Request timeout after 60 seconds')
        errorMessage = 'Timeout: DALL-E 2 membutuhkan waktu terlalu lama. Coba dengan foto yang lebih kecil atau prompt yang lebih sederhana.'
      } else if (apiError.message?.includes('content policy')) {
        console.error('Content Policy Violation:', apiError.message)
        errorMessage = 'Foto tidak sesuai kebijakan OpenAI. Pastikan foto profesional dan sesuai.'
      } else if (apiError.message?.includes('network') || apiError.message?.includes('connection')) {
        console.error('Network Error:', apiError.message)
        errorMessage = 'Koneksi bermasalah. Periksa internet Anda dan coba lagi.'
      } else {
        console.error('General API Error:', apiError.message)
        errorMessage = 'Terjadi kesalahan saat mengedit foto. Silakan coba dengan foto yang berbeda.'
      }

      return { 
        success: false, 
        error: errorMessage
      }
    }

  } catch (error: any) {
    // Handle general backend errors (file I/O, etc.)
    console.error('General Backend Error:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    })
    
    let errorMessage = 'Terjadi kesalahan internal saat memproses foto'
    
    if (error.message?.includes('Failed to create editing mask')) {
      errorMessage = 'Gagal membuat mask editing. Silakan coba lagi.'
    } else if (error.message?.includes('Failed to prepare image')) {
      errorMessage = 'Gagal memproses gambar. Pastikan file PNG tidak corrupt.'
    } else if (error.message?.includes('ENOTFOUND') || error.message?.includes('network')) {
      errorMessage = 'Masalah koneksi internet. Periksa koneksi Anda.'
    } else if (error.message?.includes('ENOENT')) {
      errorMessage = 'File tidak ditemukan. Silakan upload ulang foto Anda.'
    }
    
    return { 
      success: false, 
      error: errorMessage
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get user IP for rate limiting
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown'

    // Check rate limit
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Terlalu banyak request untuk edit foto. Tunggu 1 menit ya! ⏳' },
        { status: 429 }
      )
    }

    // Check if OpenAI is configured
    if (!openai) {
      return NextResponse.json(
        { error: 'OpenAI API belum dikonfigurasi. Silakan hubungi administrator.' },
        { status: 500 }
      )
    }

    // Parse form data
    const formData = await request.formData()
    const imageFile = formData.get('image') as File | null
    const userPrompt = formData.get('prompt') as string

    if (!userPrompt || userPrompt.trim().length === 0) {
      return NextResponse.json(
        { error: 'Prompt tidak boleh kosong!' },
        { status: 400 }
      )
    }

    if (!imageFile) {
      return NextResponse.json(
        { error: 'File gambar tidak ditemukan!' },
        { status: 400 }
      )
    }

    // Validate file type - Accept PNG and common image formats, convert to PNG
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!allowedTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: 'Format file tidak didukung! Gunakan PNG, JPG, atau WebP.' },
        { status: 400 }
      )
    }

    // Validate file size (max 4MB for OpenAI)
    const maxSize = 4 * 1024 * 1024 // 4MB
    if (imageFile.size > maxSize) {
      return NextResponse.json(
        { error: 'Ukuran file terlalu besar! Maksimal 4MB.' },
        { status: 400 }
      )
    }

    console.log('Processing photo edit request:', {
      fileName: imageFile.name,
      fileSize: imageFile.size,
      prompt: userPrompt
    })

    // Generate professionally edited photo
    const result = await generate_professional_edited_photo(imageFile, userPrompt)

    if (result.success) {
      return NextResponse.json({
        success: true,
        imageUrl: result.imageUrl,
        message: 'Foto profesional berhasil diedit! ✨'
      })
    } else {
      return NextResponse.json(
        { error: result.error || 'Gagal mengedit foto profesional' },
        { status: 500 }
      )
    }

  } catch (error: any) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Terjadi kesalahan internal. Silakan coba lagi.' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Professional Photo Editor API (DALL-E 2)',
    features: [
      'Smart mask generation to protect subject identity',
      'Professional background editing',
      'Face preservation with identity protection',
      'Background replacement and enhancement'
    ],
    endpoints: {
      POST: 'Upload PNG image and prompt for professional editing',
    },
    requirements: {
      image: 'PNG format (max 4MB)',
      prompt: 'Description of desired background changes'
    },
    examples: {
      prompts: [
        'Ubah latar belakang menjadi putih bersih profesional',
        'Ganti background dengan gradient abu-abu halus', 
        'Buat latar belakang kantor modern yang blur',
        'Hapus semua elemen yang mengganggu dari background'
      ]
    }
  })
}