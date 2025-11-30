import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'

// Initialize OpenAI
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null

// Rate limiting configuration
const RATE_LIMIT = {
  maxRequestsPerMinute: 3,  // Stricter limit for image generation (expensive operation)
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
 * Generate professional photo using OpenAI DALL-E
 */
async function generate_professional_photo(
  imageFile: File | string, 
  userPrompt: string
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  if (!openai) {
    return { success: false, error: 'OpenAI API key not configured' }
  }

  try {
    // Create comprehensive prompt with specific guardrails
    const comprehensivePrompt = `Edit this professional headshot photo. IMPORTANT: Keep the person's face, facial features, expression, hair, and glasses EXACTLY the same. Only change: ${userPrompt}. 

SPECIFIC REQUIREMENTS:
- Keep the person's identity and appearance identical
- Remove any logos, stickers, badges, or text overlays
- Create a clean, professional CV photo
- Maintain natural lighting and realistic quality
- If background change is requested, make it smooth gradient or solid color
- Keep clothing changes minimal and professional
- NO cartoon elements, NO digital artifacts, NO text/logos

Result must look like a real photograph suitable for a professional CV.`

    let response

    if (typeof imageFile === 'string') {
      // Use DALL-E 3 for text-to-image generation (when no image provided)
      response = await openai.images.generate({
        model: "dall-e-3",
        prompt: comprehensivePrompt,
        size: "1024x1024",
        quality: "hd",
        style: "natural",
        n: 1,
      })
    } else {
      // Use DALL-E 2 for image editing (when image is provided)
      response = await openai.images.edit({
        model: "dall-e-2",
        image: imageFile as any,
        prompt: comprehensivePrompt,
        size: "1024x1024",
        n: 1,
      })
    }

    if (response.data && response.data.length > 0) {
      return { 
        success: true, 
        imageUrl: response.data[0].url 
      }
    } else {
      return { 
        success: false, 
        error: 'No image generated' 
      }
    }

  } catch (error: any) {
    console.error('Photo generation error:', error)
    
    // Handle specific OpenAI API errors
    let errorMessage = 'Gagal membuat foto profesional'
    
    if (error.message) {
      if (error.message.includes('Uploaded image must be a PNG')) {
        errorMessage = 'File harus berformat PNG! Silakan konversi file Anda ke PNG menggunakan converter online seperti convertio.co'
      } else if (error.message.includes('less than 4 MB')) {
        errorMessage = 'Ukuran file terlalu besar! Maksimal 4MB. Silakan kompres foto Anda terlebih dahulu.'
      } else if (error.message.includes('invalid image')) {
        errorMessage = 'File gambar tidak valid! Pastikan file PNG Anda tidak corrupt.'
      } else if (error.message.includes('rate limit')) {
        errorMessage = 'Terlalu banyak request. Silakan tunggu beberapa saat sebelum mencoba lagi.'
      } else {
        errorMessage = 'Terjadi kesalahan saat memproses foto. Silakan coba lagi dengan file PNG yang berbeda.'
      }
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
        { error: 'Terlalu banyak request untuk generate foto. Tunggu 1 menit ya! ⏳' },
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

    // Validate file type - support JPEG/JPG/PNG but convert to PNG for OpenAI
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png']
    if (!allowedTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: 'Format file tidak didukung! Gunakan JPG, JPEG, atau PNG.' },
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

    // OpenAI DALL-E only supports PNG for image editing
    if (imageFile.type !== 'image/png') {
      return NextResponse.json(
        { error: 'File harus berformat PNG! DALL-E memerlukan file PNG untuk editing foto. Gunakan converter online seperti convertio.co untuk mengubah JPEG ke PNG.' },
        { status: 400 }
      )
    }

    // Log file details for debugging
    console.log('File details:', {
      name: imageFile.name,
      type: imageFile.type,
      size: imageFile.size,
      sizeInMB: (imageFile.size / (1024 * 1024)).toFixed(2)
    })

    // Additional PNG validation - check file signature
    try {
      const arrayBuffer = await imageFile.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      
      // PNG signature: 89 50 4E 47 0D 0A 1A 0A
      const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
      const isValidPNG = pngSignature.every((byte, index) => uint8Array[index] === byte)
      
      if (!isValidPNG) {
        return NextResponse.json(
          { error: 'File PNG tidak valid! File ini mungkin corrupt atau bukan PNG asli. Coba convert ulang ke PNG.' },
          { status: 400 }
        )
      }

      console.log('PNG signature validation passed')
      
      // Create a proper File object for OpenAI
      const validatedFile = new File([arrayBuffer], imageFile.name, { type: 'image/png' })
      
      // Generate professional photo
      const result = await generate_professional_photo(validatedFile, userPrompt)
      
      if (result.success) {
        return NextResponse.json({
          success: true,
          imageUrl: result.imageUrl,
          message: 'Foto profesional berhasil dibuat! ✨'
        })
      } else {
        return NextResponse.json(
          { error: result.error || 'Gagal membuat foto profesional' },
          { status: 500 }
        )
      }
      
    } catch (validationError) {
      console.error('PNG validation error:', validationError)
      return NextResponse.json(
        { error: 'Gagal memvalidasi file PNG. Pastikan file tidak corrupt dan coba lagi.' },
        { status: 400 }
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
    message: 'Professional Photo Generator API',
    endpoints: {
      POST: 'Upload image and prompt for professional photo generation',
    },
    requirements: {
      image: 'JPG, JPEG, or PNG (max 4MB)',
      prompt: 'Description of desired changes'
    },
    examples: {
      prompts: [
        'Ganti latar belakang menjadi abu-abu solid profesional',
        'Ubah pakaian menjadi kemeja formal biru muda',
        'Perbaiki pencahayaan untuk terlihat lebih profesional',
        'Tambahkan setelan jas hitam dengan dasi biru'
      ]
    }
  })
}