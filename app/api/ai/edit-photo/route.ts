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
 * Create AI-like smart mask for DALL-E 2 image editing using advanced background detection
 * Uses edge detection, color clustering, and contrast analysis for accurate subject/background separation
 */
async function createBackgroundMask(imageBuffer: Buffer, width: number = 1024, height: number = 1024): Promise<Buffer> {
  try {
    console.log('🤖 Creating AI-powered smart mask with dimensions:', width, 'x', height)
    
    // Step 1: Get RGB image data for analysis
    const { data: imageData } = await sharp(imageBuffer)
      .resize(width, height, { fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    
    // Step 2: Generate edge detection mask using Sobel operator
    console.log('🔍 Performing edge detection analysis...')
    const edgeMap = new Float32Array(width * height)
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        const pixelIdx = idx * 3
        
        // Get surrounding pixels for Sobel operator
        const tl = getGrayscale(imageData, (y-1) * width + (x-1)) // top-left
        const tm = getGrayscale(imageData, (y-1) * width + x)     // top-middle
        const tr = getGrayscale(imageData, (y-1) * width + (x+1)) // top-right
        const ml = getGrayscale(imageData, y * width + (x-1))     // middle-left
        const mr = getGrayscale(imageData, y * width + (x+1))     // middle-right
        const bl = getGrayscale(imageData, (y+1) * width + (x-1)) // bottom-left
        const bm = getGrayscale(imageData, (y+1) * width + x)     // bottom-middle
        const br = getGrayscale(imageData, (y+1) * width + (x+1)) // bottom-right
        
        // Sobel X and Y gradients
        const sobelX = (tr + 2*mr + br) - (tl + 2*ml + bl)
        const sobelY = (bl + 2*bm + br) - (tl + 2*tm + tr)
        const gradient = Math.sqrt(sobelX*sobelX + sobelY*sobelY)
        
        edgeMap[idx] = gradient
      }
    }
    
    // Step 3: Analyze color clusters and background uniformity
    console.log('🎨 Analyzing color clusters and background patterns...')
    const colorClusters = analyzeColorClusters(imageData, width, height)
    const backgroundAreas = detectBackgroundAreas(imageData, edgeMap, width, height, colorClusters)
    
    // Step 4: Create sophisticated mask
    console.log('✨ Generating sophisticated subject/background mask...')
    const rawMaskData = new Uint8Array(width * height * 4)
    
    let protectedPixels = 0
    let editablePixels = 0
    let backgroundDetected = 0
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        const maskIdx = idx * 4
        const pixelIdx = idx * 3
        
        // Combine multiple detection methods
        const isBackground = isBackgroundPixel(
          x, y, idx, 
          imageData, edgeMap, backgroundAreas, 
          width, height, colorClusters
        )
        
        if (isBackground) {
          // Background area = FULLY TRANSPARENT (EDITABLE by DALL-E)
          rawMaskData[maskIdx] = 0       // R = black
          rawMaskData[maskIdx + 1] = 0   // G = black  
          rawMaskData[maskIdx + 2] = 0   // B = black
          rawMaskData[maskIdx + 3] = 0   // A = FULLY transparent (0 = DALL-E will replace this)
          editablePixels++
          backgroundDetected++
        } else {
          // Subject area = FULLY OPAQUE WHITE (PROTECTED by DALL-E)
          rawMaskData[maskIdx] = 255     // R = white
          rawMaskData[maskIdx + 1] = 255 // G = white
          rawMaskData[maskIdx + 2] = 255 // B = white
          rawMaskData[maskIdx + 3] = 255 // A = FULLY opaque (255 = DALL-E will preserve this)
          protectedPixels++
        }
      }
    }
    
    // 🧹 CRITICAL: Clean mask to remove semi-transparent artifacts
    console.log('🧹 Cleaning mask to eliminate semi-transparent artifacts...')
    const cleanedMaskData = cleanMaskArtifacts(rawMaskData, width, height)
    
    console.log('🎯 AI MASK STATISTICS (Advanced detection):', {
      protectedPixels,
      editablePixels,
      backgroundDetected,
      totalPixels: width * height,
      protectionRatio: (protectedPixels / (width * height) * 100).toFixed(2) + '%',
      editableRatio: (editablePixels / (width * height) * 100).toFixed(2) + '%',
      backgroundDetectionRatio: (backgroundDetected / (width * height) * 100).toFixed(2) + '%'
    })
    
    // Validate mask effectiveness
    if (editablePixels === 0) {
      console.warn('⚠️  WARNING: No background areas detected! Mask may be too restrictive.')
    }
    if (protectedPixels === 0) {
      console.warn('⚠️  WARNING: No subject detected! Entire image will be edited.')
    }
    if (backgroundDetected < (width * height * 0.1)) {
      console.warn('⚠️  WARNING: Very small background area detected. Results may be limited.')
    }
    
    // Convert cleaned mask to PNG buffer using Sharp
    const maskBuffer = await sharp(cleanedMaskData, {
      raw: {
        width,
        height,
        channels: 4
      }
    }).png().toBuffer()
    
    console.log('✅ Clean mask buffer created, size:', maskBuffer.length, 'bytes')
    
    // 🔍 CRITICAL DEBUGGING: Save mask for manual inspection
    try {
      // Save mask to public directory for easy access and inspection
      const fs = require('fs').promises
      const path = require('path')
      const debugMaskPath = path.join(process.cwd(), 'public', 'DEBUG_generated_mask.png')
      
      await fs.writeFile(debugMaskPath, maskBuffer)
      
      console.log('🔍 CLEAN MASK DEBUG INFO:')
      console.log('✅ Clean mask saved to: /public/DEBUG_generated_mask.png')
      console.log('📏 Mask dimensions: 1024x1024')
      console.log('💾 Mask file size:', (maskBuffer.length / (1024*1024)).toFixed(2), 'MB')
      console.log('🎭 Mask format: PNG with RGBA channels (CLEANED)')
      console.log('🌐 Access via: https://your-domain/DEBUG_generated_mask.png')
      console.log('')
      console.log('📋 CLEAN MASK INSPECTION CHECKLIST:')
      console.log('   ✅ Subject (face/body) should appear PURE WHITE/OPAQUE')
      console.log('   ✅ Background should appear FULLY TRANSPARENT (checkerboard)')
      console.log('   ✅ NO semi-transparent pixels (eliminates blue artifacts)')
      console.log('   ❌ If all white: mask too protective (no editing will happen)')
      console.log('   ❌ If all transparent: mask too aggressive (face will be edited)')
      console.log('')
      
      // Analyze cleaned mask transparency distribution
      const maskAnalysis = analyzeMaskDistribution(cleanedMaskData, width, height)
      console.log('📊 CLEAN MASK PIXEL ANALYSIS:', maskAnalysis)
      
    } catch (saveError: any) {
      console.warn('⚠️  Could not save debug mask file:', saveError?.message || saveError)
    }
    
    return maskBuffer
  } catch (error) {
    console.error('Error creating smart mask:', error)
    throw new Error('Failed to create AI-powered editing mask')
  }
}

/**
 * Helper function: Convert RGB to grayscale value
 */
function getGrayscale(imageData: Uint8Array, pixelIndex: number): number {
  const idx = pixelIndex * 3
  const r = imageData[idx]
  const g = imageData[idx + 1] 
  const b = imageData[idx + 2]
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b)
}

/**
 * Helper function: Analyze color clusters in the image
 */
function analyzeColorClusters(imageData: Uint8Array, width: number, height: number) {
  const colorMap = new Map<string, number>()
  const sampleStep = 8 // Sample every 8th pixel for performance
  
  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const idx = (y * width + x) * 3
      const r = Math.floor(imageData[idx] / 32) * 32     // Quantize to reduce colors
      const g = Math.floor(imageData[idx + 1] / 32) * 32
      const b = Math.floor(imageData[idx + 2] / 32) * 32
      const colorKey = `${r},${g},${b}`
      
      colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1)
    }
  }
  
  // Find dominant colors (likely background)
  const sortedColors = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5) // Top 5 colors
  
  return {
    dominantColors: sortedColors.map(([color, count]) => ({
      rgb: color.split(',').map(Number),
      frequency: count
    })),
    totalSamples: Math.floor((width * height) / (sampleStep * sampleStep))
  }
}

/**
 * Helper function: Detect background areas using color uniformity and edge analysis
 */
function detectBackgroundAreas(
  imageData: Uint8Array, 
  edgeMap: Float32Array, 
  width: number, 
  height: number,
  colorClusters: any
): Float32Array {
  const backgroundMap = new Float32Array(width * height)
  const edgeThreshold = 30 // Pixels with gradient below this are likely uniform background
  
  // Mark areas with low edge activity as potential background
  for (let i = 0; i < width * height; i++) {
    const gradient = edgeMap[i]
    const isLowEdge = gradient < edgeThreshold
    
    if (isLowEdge) {
      // Check if pixel color matches dominant background colors
      const pixelIdx = i * 3
      const r = imageData[pixelIdx]
      const g = imageData[pixelIdx + 1]
      const b = imageData[pixelIdx + 2]
      
      let backgroundScore = 0
      for (const dominant of colorClusters.dominantColors) {
        const [dr, dg, db] = dominant.rgb
        const colorDistance = Math.sqrt(
          Math.pow(r - dr, 2) + Math.pow(g - dg, 2) + Math.pow(b - db, 2)
        )
        
        if (colorDistance < 60) { // Color similarity threshold
          backgroundScore += dominant.frequency / colorClusters.totalSamples
        }
      }
      
      backgroundMap[i] = backgroundScore
    }
  }
  
  return backgroundMap
}

/**
 * Helper function: Determine if a pixel is background using combined analysis
 */
function isBackgroundPixel(
  x: number, y: number, idx: number,
  imageData: Uint8Array,
  edgeMap: Float32Array,
  backgroundAreas: Float32Array,
  width: number, height: number,
  colorClusters: any
): boolean {
  // Border bias - edges of image are more likely background
  const borderDistance = Math.min(x, y, width - x - 1, height - y - 1)
  const borderBias = borderDistance < 50 ? 0.3 : 0
  
  // Edge activity - low edges suggest uniform background
  const edgeScore = edgeMap[idx] < 25 ? 0.4 : 0
  
  // Color cluster score - matches dominant background colors
  const colorScore = backgroundAreas[idx]
  
  // Center bias - center pixels are less likely to be background (subject usually centered)
  const centerX = width / 2
  const centerY = height / 2
  const centerDistance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2))
  const maxDistance = Math.sqrt(Math.pow(centerX, 2) + Math.pow(centerY, 2))
  const centerBias = (centerDistance / maxDistance) * 0.2
  
  // Combine all scores
  const backgroundScore = borderBias + edgeScore + colorScore + centerBias
  
  return backgroundScore > 0.5 // Threshold for background classification
}

/**
 * CRITICAL: Clean mask to eliminate semi-transparent artifacts that cause blue remnants
 */
function cleanMaskArtifacts(rawMaskData: Uint8Array, width: number, height: number): Uint8Array {
  console.log('🧹 Applying binary thresholding to eliminate semi-transparent artifacts...')
  
  const cleanedMask = new Uint8Array(width * height * 4)
  let cleaningStats = {
    semiTransparentCleaned: 0,
    fullyTransparent: 0,
    fullyOpaque: 0,
    artifactsRemoved: 0
  }
  
  // CRITICAL THRESHOLDING: Remove ALL semi-transparency
  const transparencyThreshold = 10  // Any alpha < 10 becomes 0, >= 10 becomes 255
  
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4
    const originalAlpha = rawMaskData[idx + 3]
    
    if (originalAlpha < transparencyThreshold) {
      // FORCE FULLY TRANSPARENT (background = editable by DALL-E)
      cleanedMask[idx] = 0       // R = black
      cleanedMask[idx + 1] = 0   // G = black
      cleanedMask[idx + 2] = 0   // B = black
      cleanedMask[idx + 3] = 0   // A = FULLY transparent (0)
      cleaningStats.fullyTransparent++
      
      if (originalAlpha > 0) {
        cleaningStats.semiTransparentCleaned++
      }
    } else {
      // FORCE FULLY OPAQUE (subject = protected by DALL-E)
      cleanedMask[idx] = 255     // R = white
      cleanedMask[idx + 1] = 255 // G = white
      cleanedMask[idx + 2] = 255 // B = white
      cleanedMask[idx + 3] = 255 // A = FULLY opaque (255)
      cleaningStats.fullyOpaque++
      
      if (originalAlpha < 255) {
        cleaningStats.artifactsRemoved++
      }
    }
  }
  
  console.log('🧹 Mask cleaning results:', {
    ...cleaningStats,
    totalPixels: width * height,
    cleaningEffectiveness: cleaningStats.semiTransparentCleaned > 0 ? 'Artifacts removed' : 'Already clean'
  })
  
  // Optional: Apply slight blur to edges then re-threshold for smoother boundaries
  // This helps eliminate jagged edges while maintaining binary transparency
  console.log('✨ Applying edge smoothing to prevent jagged boundaries...')
  const smoothedMask = applyEdgeSmoothing(cleanedMask, width, height)
  
  return smoothedMask
}

/**
 * Apply subtle edge smoothing to prevent jagged mask boundaries
 */
function applyEdgeSmoothing(maskData: Uint8Array, width: number, height: number): Uint8Array {
  const smoothed = new Uint8Array(maskData) // Copy original
  
  // Simple 3x3 kernel smoothing for edge pixels only
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4
      const alpha = maskData[idx + 3]
      
      // Only smooth pixels at edges (transition zones)
      if (alpha === 0 || alpha === 255) {
        // Check if this pixel is near an edge (has different neighbors)
        const neighbors = [
          maskData[((y-1) * width + x) * 4 + 3],      // top
          maskData[((y+1) * width + x) * 4 + 3],      // bottom
          maskData[(y * width + (x-1)) * 4 + 3],     // left
          maskData[(y * width + (x+1)) * 4 + 3]      // right
        ]
        
        const hasOppositeNeighbor = neighbors.some(n => 
          (alpha === 0 && n === 255) || (alpha === 255 && n === 0)
        )
        
        if (hasOppositeNeighbor) {
          // This is an edge pixel - apply very subtle smoothing
          const avgNeighbor = neighbors.reduce((sum, n) => sum + n, 0) / neighbors.length
          
          // Only adjust if majority of neighbors agree
          if ((alpha === 0 && avgNeighbor < 64) || (alpha === 255 && avgNeighbor > 191)) {
            // Keep current value (no change needed)
            continue
          } else if (avgNeighbor > 127) {
            // Majority opaque - make this opaque too
            smoothed[idx] = 255
            smoothed[idx + 1] = 255
            smoothed[idx + 2] = 255
            smoothed[idx + 3] = 255
          } else {
            // Majority transparent - make this transparent too  
            smoothed[idx] = 0
            smoothed[idx + 1] = 0
            smoothed[idx + 2] = 0
            smoothed[idx + 3] = 0
          }
        }
      }
    }
  }
  
  return smoothed
}

/**
 * Helper function: Analyze mask pixel distribution for debugging
 */
function analyzeMaskDistribution(maskData: Uint8Array, width: number, height: number) {
  let transparentPixels = 0
  let semiTransparentPixels = 0  
  let opaquePixels = 0
  let whitePixels = 0
  let blackPixels = 0
  
  for (let i = 0; i < width * height; i++) {
    const maskIdx = i * 4
    const r = maskData[maskIdx]
    const g = maskData[maskIdx + 1] 
    const b = maskData[maskIdx + 2]
    const a = maskData[maskIdx + 3]
    
    // Analyze alpha channel (transparency)
    if (a === 0) {
      transparentPixels++
    } else if (a > 0 && a < 255) {
      semiTransparentPixels++
    } else {
      opaquePixels++
    }
    
    // Analyze RGB values
    if (r === 255 && g === 255 && b === 255) {
      whitePixels++
    } else if (r === 0 && g === 0 && b === 0) {
      blackPixels++
    }
  }
  
  const totalPixels = width * height
  
  return {
    totalPixels,
    transparency: {
      transparent: transparentPixels,
      semiTransparent: semiTransparentPixels,
      opaque: opaquePixels,
      transparentRatio: ((transparentPixels / totalPixels) * 100).toFixed(1) + '%',
      opaqueRatio: ((opaquePixels / totalPixels) * 100).toFixed(1) + '%'
    },
    colors: {
      white: whitePixels,
      black: blackPixels,
      whiteRatio: ((whitePixels / totalPixels) * 100).toFixed(1) + '%',
      blackRatio: ((blackPixels / totalPixels) * 100).toFixed(1) + '%'
    },
    maskQuality: {
      hasSubject: opaquePixels > 0 && transparentPixels > 0,
      balanced: transparentPixels > totalPixels * 0.1 && opaquePixels > totalPixels * 0.1,
      recommendation: getQualityRecommendation(transparentPixels, opaquePixels, totalPixels)
    }
  }
}

/**
 * Helper function: Get mask quality recommendation
 */
function getQualityRecommendation(transparent: number, opaque: number, total: number) {
  const transparentRatio = transparent / total
  const opaqueRatio = opaque / total
  
  if (transparentRatio < 0.05) {
    return '❌ Too protective - almost no background will be edited'
  } else if (transparentRatio > 0.95) {
    return '❌ Too aggressive - subject will be edited too'
  } else if (opaqueRatio < 0.05) {
    return '❌ No subject protection - face/body will be changed'
  } else if (transparentRatio > 0.1 && opaqueRatio > 0.1) {
    return '✅ Good balance - should work well with DALL-E'
  } else {
    return '⚠️ Moderate balance - may work but check visual result'
  }
}

/**
 * Prepare image for DALL-E 2 editing
 */
async function prepareImageForEditing(imageBuffer: Buffer): Promise<{ buffer: Buffer; originalWidth: number; originalHeight: number }> {
  try {
    console.log('Processing image buffer, size:', imageBuffer.length)
    
    // Get original dimensions first
    const metadata = await sharp(imageBuffer).metadata()
    const originalWidth = metadata.width || 512
    const originalHeight = metadata.height || 512
    
    console.log('Original dimensions:', originalWidth, 'x', originalHeight)
    
    // Resize to 1024x1024 as REQUIRED by DALL-E 2 API
    const processedBuffer = await sharp(imageBuffer)
      .resize(1024, 1024, { 
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
    
    // CRITICAL: Validate final dimensions
    const finalMetadata = await sharp(processedBuffer).metadata()
    console.log('Final processed image dimensions:', finalMetadata.width, 'x', finalMetadata.height)
    
    if (finalMetadata.width !== 1024 || finalMetadata.height !== 1024) {
      throw new Error(`Image dimensions MUST be 1024x1024. Got: ${finalMetadata.width}x${finalMetadata.height}`)
    }
    
    console.log('✅ Image processed successfully, size:', processedBuffer.length, 'bytes')
    console.log('✅ Dimensions validated: 1024x1024')
    
    // 🔍 SAVE PROCESSED IMAGE FOR DEBUGGING
    try {
      const fs = require('fs').promises
      const path = require('path')
      const debugImagePath = path.join(process.cwd(), 'public', 'DEBUG_processed_image.png')
      
      await fs.writeFile(debugImagePath, processedBuffer)
      console.log('🔍 Processed image saved to: /public/DEBUG_processed_image.png')
      console.log('🌐 Access via: https://your-domain/DEBUG_processed_image.png')
    } catch (saveError: any) {
      console.warn('⚠️  Could not save debug image:', saveError?.message || saveError)
    }
    
    return { buffer: processedBuffer, originalWidth, originalHeight }
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
    
    // Step 1: Prepare the original image and get dimensions
    const originalImageBuffer = Buffer.from(await imageFile.arrayBuffer())
    const { buffer: preparedImage, originalWidth, originalHeight } = await prepareImageForEditing(originalImageBuffer)
    
    console.log('Image prepared, original size:', originalWidth, 'x', originalHeight)
    console.log('Creating aggressive mask...')
    
    // Step 2: Create precise mask based on blue background detection
    const maskBuffer = await createBackgroundMask(preparedImage, 1024, 1024)
    
    // Step 3: Build extremely forceful prompt to guarantee background change
    const comprehensivePrompt = `COMPLETELY REPLACE entire background. REMOVE ALL existing background colors especially blue. ${userDescriptionPrompt}. MUST be dramatically different background. Only keep the person's head and face identical. TRANSFORM background 100%. Professional studio photo.`

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
      
      // CRITICAL DEBUGGING: Log everything before API call
      console.log('=== DALL-E 2 API REQUEST DEBUG ===');
      console.log('Image file size:', preparedImage.length, 'bytes');
      console.log('Mask file size:', maskBuffer.length, 'bytes');
      console.log('Image file type:', imageFile.type);
      console.log('Mask file type:', maskFile.type);
      console.log('Prompt:', comprehensivePrompt);
      console.log('Model: dall-e-2');
      console.log('Size: 1024x1024');
      console.log('Files under 4MB?', {
        image: (preparedImage.length < 4 * 1024 * 1024),
        mask: (maskBuffer.length < 4 * 1024 * 1024)
      });
      console.log('=== END DEBUG ===');

      const response = await Promise.race([
        openai.images.edit({
          model: "dall-e-2",
          image: imageFile as any,
          mask: maskFile as any,
          prompt: comprehensivePrompt,
          size: "1024x1024",
          n: 1,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout after 60 seconds')), 60000)
        )
      ]) as any

      if (response.data && response.data.length > 0) {
        console.log('Professional photo editing successful')
        
        // If we need to resize back to original dimensions (future enhancement)
        // For now, return the edited image URL as-is since DALL-E returns 512x512
        const editedImageUrl = response.data[0].url
        
        return { 
          success: true, 
          imageUrl: editedImageUrl 
        }
      } else {
        console.error('No data in OpenAI response:', response)
        return { 
          success: false, 
          error: 'No edited image generated' 
        }
      }

    } catch (apiError: any) {
      console.error('=== OPENAI API ERROR DETAILS ===');
      console.error('Error message:', apiError.message);
      console.error('Status code:', apiError.status);
      console.error('Error code:', apiError.code);
      console.error('Error type:', apiError.type);
      console.error('Full error object:', apiError);
      console.error('Request config that failed:', {
        model: 'dall-e-2',
        size: '1024x1024',
        imageSize: preparedImage?.length,
        maskSize: maskBuffer?.length,
        promptLength: comprehensivePrompt?.length
      });
      console.error('=== END ERROR DEBUG ===');

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