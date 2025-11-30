import React, { useState, useRef } from 'react'
import { Upload, Image as ImageIcon, Sparkles, Download, X, Camera } from 'lucide-react'
import toast from 'react-hot-toast'

interface ProfessionalPhotoEnhancerProps {
  onPhotoGenerated?: (imageUrl: string) => void
  className?: string
}

export default function ProfessionalPhotoEnhancer({ 
  onPhotoGenerated, 
  className = '' 
}: ProfessionalPhotoEnhancerProps) {
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const predefinedPrompts = [
    'Ganti latar belakang menjadi abu-abu solid dan bersih, hapus semua logo/stiker',
    'Ubah latar belakang menjadi putih bersih, hapus elemen yang mengganggu',
    'Ganti pakaian menjadi kemeja putih formal, latar belakang abu-abu',
    'Tambahkan jas hitam formal, latar belakang putih bersih',
    'Perbaiki pencahayaan dan buat latar belakang gradient abu-abu',
    'Buat foto studio profesional dengan latar belakang putih'
  ]

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type - DALL-E requires PNG
    if (file.type !== 'image/png') {
      toast.error('DALL-E hanya mendukung file PNG untuk editing foto. Silakan konversi file Anda ke format PNG terlebih dahulu.', {
        duration: 6000
      })
      return
    }

    // Validate file size (max 4MB)
    const maxSize = 4 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error('Ukuran file terlalu besar! Maksimal 4MB.')
      return
    }

    setSelectedImage(file)
    
    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)

    // Reset generated image
    setGeneratedImage(null)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file) {
      // Simulate file input change
      const input = fileInputRef.current
      if (input) {
        const dt = new DataTransfer()
        dt.items.add(file)
        input.files = dt.files
        handleImageSelect({ target: input } as React.ChangeEvent<HTMLInputElement>)
      }
    }
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }

  const generateProfessionalPhoto = async () => {
    if (!selectedImage || !prompt.trim()) {
      toast.error('Pilih foto dan masukkan prompt terlebih dahulu!')
      return
    }

    setIsGenerating(true)
    const loadingToast = toast.loading('Sedang membuat foto profesional... ✨')

    try {
      const formData = new FormData()
      formData.append('image', selectedImage)
      formData.append('prompt', prompt)

      const response = await fetch('/api/ai/generate-photo', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (data.success && data.imageUrl) {
        setGeneratedImage(data.imageUrl)
        toast.success(data.message || 'Foto profesional berhasil dibuat! ✨')
        onPhotoGenerated?.(data.imageUrl)
      } else {
        throw new Error(data.error || 'Gagal membuat foto profesional')
      }
    } catch (error: any) {
      console.error('Error generating photo:', error)
      toast.error(error.message || 'Terjadi kesalahan saat membuat foto profesional')
    } finally {
      setIsGenerating(false)
      toast.dismiss(loadingToast)
    }
  }

  const downloadImage = async (imageUrl: string, filename: string) => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      window.URL.revokeObjectURL(url)
      toast.success('Foto berhasil didownload! 📥')
    } catch (error) {
      toast.error('Gagal mendownload foto')
    }
  }

  const resetAll = () => {
    setSelectedImage(null)
    setImagePreview(null)
    setPrompt('')
    setSelectedPrompt(null)
    setGeneratedImage(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className={`w-full max-w-4xl mx-auto p-6 bg-white border border-gray-200 rounded-xl shadow-lg ${className}`} style={{ backgroundColor: '#ffffff', minHeight: '600px' }}>
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Camera className="w-8 h-8 text-blue-600" />
          <h2 className="text-3xl font-bold text-gray-800">
            Peningkatan Foto Profesional CV
          </h2>
        </div>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Upload foto Anda dan biarkan AI mengubahnya menjadi foto CV profesional yang memukau. 
          Fitur wajah Anda akan tetap sama, hanya pakaian, latar belakang, dan pencahayaan yang diperbaiki.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upload Section */}
        <div className="space-y-6">
          <div>
            <label className="block text-lg font-semibold text-gray-800 mb-3" style={{ color: '#1f2937' }}>
              Upload Foto Anda
            </label>
            <div
              className="border-3 border-dashed border-gray-400 rounded-lg p-8 text-center hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 cursor-pointer bg-gray-50"
              style={{ backgroundColor: '#f9fafb', borderWidth: '3px', minHeight: '280px' }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/png"
                className="hidden"
              />
              
              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="max-w-full max-h-64 mx-auto rounded-lg shadow-md"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      resetAll()
                    }}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="py-8">
                  <Upload className="w-16 h-16 text-blue-500 mx-auto mb-4" />
                  <p className="text-xl font-semibold text-gray-800 mb-2" style={{ color: '#1f2937' }}>
                    Drag & drop foto atau klik untuk upload
                  </p>
                  <p className="text-lg font-medium text-gray-600" style={{ color: '#4b5563' }}>
                    PNG saja (Max 4MB) - DALL-E requirement
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Prompt Section */}
          <div>
            <label className="block text-lg font-semibold text-gray-800 mb-3" style={{ color: '#1f2937' }}>
              Deskripsi Perubahan yang Diinginkan
            </label>
            <textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value)
                // Reset selectedPrompt when user types manually
                if (e.target.value !== selectedPrompt) {
                  setSelectedPrompt(null)
                }
              }}
              placeholder="Contoh: Ganti latar belakang menjadi abu-abu solid profesional"
              className="w-full p-4 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder-gray-500"
              rows={4}
              style={{ backgroundColor: '#ffffff', color: '#1f2937' }}
            />
          </div>

          {/* Predefined Prompts */}
          <div>
            <label className="block text-lg font-semibold text-gray-800 mb-3" style={{ color: '#1f2937' }}>
              Atau pilih prompt siap pakai:
            </label>
            <div className="grid grid-cols-1 gap-3">
              {predefinedPrompts.map((predefinedPrompt, index) => {
                const isSelected = prompt === predefinedPrompt
                return (
                  <button
                    key={index}
                    onClick={() => {
                      setPrompt(predefinedPrompt)
                      setSelectedPrompt(predefinedPrompt)
                      toast.success('Prompt dipilih! ✨')
                    }}
                    className={`text-left p-4 border-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isSelected 
                        ? 'bg-blue-100 border-blue-500 text-blue-800 shadow-md' 
                        : 'bg-gray-100 hover:bg-blue-50 border-gray-300 hover:border-blue-400 text-gray-800'
                    }`}
                    style={{ 
                      backgroundColor: isSelected ? '#dbeafe' : '#f3f4f6', 
                      borderColor: isSelected ? '#3b82f6' : '#d1d5db',
                      color: isSelected ? '#1e40af' : '#1f2937'
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span>{predefinedPrompt}</span>
                      {isSelected && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={generateProfessionalPhoto}
            disabled={!selectedImage || !prompt.trim() || isGenerating}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white py-4 px-6 rounded-lg font-bold text-lg flex items-center justify-center gap-2 transition-all duration-200 shadow-lg"
            style={{ backgroundColor: isGenerating || (!selectedImage || !prompt.trim()) ? '#9ca3af' : '#2563eb' }}
          >
            {isGenerating ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sedang Memproses...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Buat Foto Profesional
              </>
            )}
          </button>
        </div>

        {/* Result Section */}
        <div className="space-y-6">
          <div>
            <label className="block text-lg font-semibold text-gray-800 mb-3" style={{ color: '#1f2937' }}>
              Hasil Foto Profesional
            </label>
            <div className="border-2 border-gray-200 rounded-lg p-8 bg-gray-50 min-h-[300px] flex items-center justify-center">
              {generatedImage ? (
                <div className="relative">
                  <img
                    src={generatedImage}
                    alt="Professional Photo"
                    className="max-w-full max-h-96 rounded-lg shadow-lg"
                  />
                  <button
                    onClick={() => downloadImage(generatedImage, 'professional-photo.png')}
                    className="absolute bottom-2 right-2 bg-green-500 text-white rounded-full p-2 hover:bg-green-600 transition-colors"
                    title="Download Foto"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="text-center text-gray-400">
                  <ImageIcon className="w-16 h-16 mx-auto mb-4" />
                  <p>Foto profesional akan muncul di sini</p>
                </div>
              )}
            </div>
          </div>

          {generatedImage && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-medium text-green-800 mb-2">
                ✨ Foto Profesional Berhasil Dibuat!
              </h3>
              <p className="text-sm text-green-700 mb-3">
                Foto CV profesional Anda sudah siap! Klik tombol download untuk menyimpan.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => downloadImage(generatedImage, 'professional-cv-photo.png')}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Foto
                </button>
                <button
                  onClick={resetAll}
                  className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
                >
                  Buat Ulang
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tips Section */}
      <div className="mt-8 space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="font-medium text-yellow-800 mb-3">⚠️ Format File Penting:</h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• <strong>Hanya file PNG yang didukung</strong> oleh DALL-E untuk editing foto</li>
            <li>• Jika Anda memiliki file JPEG/JPG, konversi ke PNG terlebih dahulu</li>
            <li>• Gunakan online converter seperti convertio.co atau photopea.com</li>
            <li>• Pastikan file PNG tidak melebihi 4MB</li>
          </ul>
        </div>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-medium text-blue-800 mb-3">💡 Tips untuk Hasil Terbaik:</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Gunakan foto dengan wajah yang jelas dan tidak terpotong</li>
            <li>• Foto dengan pencahayaan yang baik akan memberikan hasil yang lebih optimal</li>
            <li>• Hindari foto yang terlalu blur atau berkualitas rendah</li>
            <li>• Berikan deskripsi yang spesifik untuk hasil yang lebih akurat</li>
            <li>• Fitur wajah dan ekspresi Anda akan tetap dipertahankan</li>
          </ul>
        </div>
      </div>
    </div>
  )
}