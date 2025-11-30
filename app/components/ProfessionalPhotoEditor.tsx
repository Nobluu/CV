import React, { useState, useRef } from 'react'
import { Upload, Edit3, Download, X, Camera, Wand2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface ProfessionalPhotoEditorProps {
  onPhotoEdited?: (imageUrl: string) => void
  className?: string
}

export default function ProfessionalPhotoEditor({ 
  onPhotoEdited, 
  className = '' 
}: ProfessionalPhotoEditorProps) {
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedImage, setEditedImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const predefinedPrompts = [
    'Ubah latar belakang menjadi putih bersih profesional',
    'Ganti background dengan gradient abu-abu halus dan modern',
    'Buat latar belakang kantor modern yang blur',
    'Hapus semua elemen yang mengganggu dari background',
    'Perbaiki pencahayaan dan buat background putih studio',
    'Ganti dengan latar belakang biru navy profesional'
  ]

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type - PNG only for DALL-E 2 editing
    if (file.type !== 'image/png') {
      toast.error('File harus berformat PNG! DALL-E 2 editing memerlukan file PNG untuk hasil terbaik.', {
        duration: 5000
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

    // Reset edited image
    setEditedImage(null)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file) {
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

  const editProfessionalPhoto = async () => {
    if (!selectedImage || !prompt.trim()) {
      toast.error('Pilih foto PNG dan masukkan deskripsi edit terlebih dahulu!')
      return
    }

    setIsEditing(true)
    const loadingToast = toast.loading('Sedang mengedit foto profesional... 🎨')

    try {
      const formData = new FormData()
      formData.append('image', selectedImage)
      formData.append('prompt', prompt)

      const response = await fetch('/api/ai/edit-photo', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (data.success && data.imageUrl) {
        setEditedImage(data.imageUrl)
        toast.success(data.message || 'Foto profesional berhasil diedit! ✨')
        onPhotoEdited?.(data.imageUrl)
      } else {
        throw new Error(data.error || 'Gagal mengedit foto profesional')
      }
    } catch (error: any) {
      console.error('Error editing photo:', error)
      toast.error(error.message || 'Terjadi kesalahan saat mengedit foto profesional')
    } finally {
      setIsEditing(false)
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
    setEditedImage(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className={`w-full max-w-6xl mx-auto p-6 bg-white border border-gray-200 rounded-xl shadow-lg ${className}`} style={{ backgroundColor: '#ffffff', minHeight: '600px' }}>
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Edit3 className="w-8 h-8 text-purple-600" />
          <h2 className="text-3xl font-bold text-gray-800">
            Edit Foto Profesional CV
          </h2>
        </div>
        <p className="text-gray-600 max-w-3xl mx-auto">
          Upload foto PNG Anda dan biarkan AI mengedit latar belakang secara profesional. 
          Fitur wajah dan identitas Anda akan tetap sama persis, hanya background yang diubah.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Upload & Original Image */}
        <div className="space-y-6">
          <div>
            <label className="block text-lg font-semibold text-gray-800 mb-3" style={{ color: '#1f2937' }}>
              Upload Foto Asli (PNG)
            </label>
            <div
              className="border-3 border-dashed border-gray-400 rounded-lg p-6 text-center hover:border-purple-500 hover:bg-purple-50 transition-all duration-200 cursor-pointer bg-gray-50"
              style={{ backgroundColor: '#f9fafb', borderWidth: '3px', minHeight: '250px' }}
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
                    alt="Original"
                    className="max-w-full max-h-48 mx-auto rounded-lg shadow-md"
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
                  <Upload className="w-16 h-16 text-purple-500 mx-auto mb-4" />
                  <p className="text-xl font-semibold text-gray-800 mb-2" style={{ color: '#1f2937' }}>
                    Drag & drop foto atau klik untuk upload
                  </p>
                  <p className="text-lg font-medium text-gray-600" style={{ color: '#4b5563' }}>
                    PNG saja (Max 4MB) - DALL-E 2 requirement
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Edit Controls */}
          {imagePreview && (
            <div className="space-y-4">
              <div>
                <label className="block text-lg font-semibold text-gray-800 mb-3" style={{ color: '#1f2937' }}>
                  Deskripsi Edit yang Diinginkan
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value)
                    if (e.target.value !== selectedPrompt) {
                      setSelectedPrompt(null)
                    }
                  }}
                  placeholder="Contoh: Ubah latar belakang menjadi putih bersih profesional"
                  className="w-full p-4 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white text-gray-900 placeholder-gray-500"
                  rows={3}
                  style={{ backgroundColor: '#ffffff', color: '#1f2937' }}
                />
              </div>

              <div>
                <label className="block text-lg font-semibold text-gray-800 mb-3" style={{ color: '#1f2937' }}>
                  Atau pilih preset:
                </label>
                <div className="grid grid-cols-1 gap-2">
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
                        className={`text-left p-3 border-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          isSelected 
                            ? 'bg-purple-100 border-purple-500 text-purple-800 shadow-md' 
                            : 'bg-gray-100 hover:bg-purple-50 border-gray-300 hover:border-purple-400 text-gray-800'
                        }`}
                        style={{ 
                          backgroundColor: isSelected ? '#f3e8ff' : '#f3f4f6', 
                          borderColor: isSelected ? '#8b5cf6' : '#d1d5db',
                          color: isSelected ? '#6b21a8' : '#1f2937'
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span>{predefinedPrompt}</span>
                          {isSelected && (
                            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                onClick={editProfessionalPhoto}
                disabled={!selectedImage || !prompt.trim() || isEditing}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white py-4 px-6 rounded-lg font-bold text-lg flex items-center justify-center gap-2 transition-all duration-200 shadow-lg"
                style={{ backgroundColor: isEditing || (!selectedImage || !prompt.trim()) ? '#9ca3af' : '#7c3aed' }}
              >
                {isEditing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sedang Mengedit...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5" />
                    Edit Foto Profesional
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Result Section */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <label className="block text-lg font-semibold text-gray-800 mb-3" style={{ color: '#1f2937' }}>
              Hasil Edit Profesional
            </label>
            <div className="border-2 border-gray-200 rounded-lg p-8 bg-gray-50 min-h-[400px] flex items-center justify-center">
              {editedImage ? (
                <div className="relative w-full">
                  <img
                    src={editedImage}
                    alt="Edited Professional Photo"
                    className="max-w-full max-h-96 mx-auto rounded-lg shadow-xl"
                  />
                  <button
                    onClick={() => downloadImage(editedImage, 'edited-professional-photo.png')}
                    className="absolute bottom-4 right-4 bg-green-500 text-white rounded-full p-3 hover:bg-green-600 transition-colors shadow-lg"
                    title="Download Foto"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="text-center text-gray-400">
                  <Camera className="w-20 h-20 mx-auto mb-4" />
                  <p className="text-xl">Foto hasil edit akan muncul di sini</p>
                  <p className="text-sm mt-2">Upload foto PNG dan klik "Edit Foto Profesional"</p>
                </div>
              )}
            </div>
          </div>

          {editedImage && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <h3 className="font-medium text-green-800 mb-2">
                ✨ Foto Berhasil Diedit Secara Profesional!
              </h3>
              <p className="text-sm text-green-700 mb-4">
                Background foto Anda telah diubah dengan mempertahankan identitas dan fitur wajah yang sama persis. 
                Foto siap untuk digunakan di CV profesional!
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => downloadImage(editedImage, 'professional-edited-cv-photo.png')}
                  className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Foto
                </button>
                <button
                  onClick={resetAll}
                  className="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700 transition-colors"
                >
                  Edit Foto Baru
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info & Tips Section */}
      <div className="mt-8 space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-medium text-blue-800 mb-3">🎨 Cara Kerja Edit Foto Profesional:</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• <strong>AI Mask Technology:</strong> Sistem otomatis melindungi wajah dan identitas Anda</li>
            <li>• <strong>Background Editing:</strong> Hanya latar belakang dan elemen yang mengganggu yang diubah</li>
            <li>• <strong>Identity Preservation:</strong> Fitur wajah, ekspresi, dan penampilan tetap 100% sama</li>
            <li>• <strong>Professional Quality:</strong> Hasil foto realistis dan cocok untuk CV bisnis</li>
          </ul>
        </div>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="font-medium text-yellow-800 mb-3">⚠️ Persyaratan Format:</h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• <strong>Hanya file PNG</strong> yang didukung oleh DALL-E 2 untuk editing</li>
            <li>• <strong>Maksimal 4MB</strong> ukuran file</li>
            <li>• <strong>Resolusi optimal:</strong> Foto akan otomatis diubah ke 1024x1024px</li>
            <li>• <strong>Konversi JPEG:</strong> Gunakan convertio.co untuk mengubah JPEG ke PNG</li>
          </ul>
        </div>
      </div>
    </div>
  )
}