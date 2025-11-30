'use client'

import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { 
  Download, 
  Eye, 
  FileText, 
  Share2, 
  Printer,
  CheckCircle,
  AlertCircle,
  Trash2
} from 'lucide-react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import toast from 'react-hot-toast'

interface CVPreviewProps {
  cvData: any
  template: string
  onClear?: () => void
}

export default function CVPreview({ cvData, template, onClear }: CVPreviewProps) {
  // Normalize data shapes: some flows use `experience` while others use `experiences`.
  const normalizedCvData = {
    ...cvData,
    experience: cvData?.experience || cvData?.experiences || [],
    languages: cvData?.languages || cvData?.language || [],
  }
  // Sanitize / tidy up fields coming from AI extraction
  const sanitizeText = (s: any) => {
    if (!s && s !== 0) return ''
    try {
      return String(s).replace(/\s+/g, ' ').trim()
    } catch {
      return ''
    }
  }

  const sanitizedCvData = (() => {
    const out: any = { ...normalizedCvData }
    // personalInfo
    out.personalInfo = {
      name: sanitizeText(out.personalInfo?.name),
      email: sanitizeText(out.personalInfo?.email),
      phone: sanitizeText(out.personalInfo?.phone),
      address: sanitizeText(out.personalInfo?.address),
      summary: sanitizeText(out.personalInfo?.summary)
    }

    // experiences: ensure fields exist and trim, remove accidental duplication of name as position
    out.experience = (out.experience || []).map((e: any) => {
      const position = sanitizeText(e?.position)
      const company = sanitizeText(e?.company)
      const duration = sanitizeText(e?.duration)
      let description = sanitizeText(e?.description)

      // If position equals the person's name (common AI mistake), clear it
      if (out.personalInfo?.name && position && position.toLowerCase().includes(out.personalInfo.name.toLowerCase())) {
        // Remove the name from position
        const cleaned = position.replace(new RegExp(out.personalInfo.name, 'ig'), '').replace(/^[,\s-:]+/, '')
        // if nothing left, set to empty
        if (!cleaned.trim()) {
          // move any leftover into description if description is empty
          if (!description) description = position
          return { company, position: '', duration, description }
        }
        return { company, position: cleaned.trim(), duration, description }
      }

      return { company, position, duration, description }
    })

    // education
    out.education = (out.education || []).map((edu: any) => ({
      institution: sanitizeText(edu?.institution),
      degree: sanitizeText(edu?.degree),
      field: sanitizeText(edu?.field),
      year: sanitizeText(edu?.year)
    }))

    // skills: normalize shapes, prefer strings
    out.skills = (out.skills || []).map((s: any) => {
      if (!s) return ''
      if (typeof s === 'string') return sanitizeText(s)
      return sanitizeText(s?.name || '')
    }).filter((v: string) => !!v)

    // languages
    out.languages = (out.languages || []).map((l: any) => {
      if (!l) return ''
      if (typeof l === 'string') return sanitizeText(l)
      return sanitizeText(l?.name || '')
    }).filter((v: string) => !!v)

    return out
  })()
  const [isGenerating, setIsGenerating] = useState(false)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const cvRef = useRef<HTMLDivElement>(null)
  
  // Use template from cvData if not explicitly passed
  const activeTemplate = template || cvData?.template?.id || 'modern'

  const handleDownloadPDF = async () => {
    if (!cvRef.current) return

    setIsGenerating(true)
    try {
      const canvas = await html2canvas(cvRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      
      const imgWidth = 210
      const pageHeight = 295
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight

      let position = 0

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      pdf.save(`${cvData?.personalInfo?.name || 'CV'}.pdf`)
      toast.success('CV berhasil diunduh sebagai PDF!')
    } catch (error) {
      console.error('Error generating PDF:', error)
      toast.error('Gagal mengunduh PDF')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownloadImage = async () => {
    if (!cvRef.current) return

    setIsGenerating(true)
    try {
      const canvas = await html2canvas(cvRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      })

      const link = document.createElement('a')
      link.download = `${cvData?.personalInfo?.name || 'CV'}.png`
      link.href = canvas.toDataURL()
      link.click()
      
      toast.success('CV berhasil diunduh sebagai gambar!')
    } catch (error) {
      console.error('Error generating image:', error)
      toast.error('Gagal mengunduh gambar')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleShare = async () => {
    if (!cvRef.current) {
      toast.error('CV belum siap untuk dibagikan')
      return
    }

    try {
      setIsGenerating(true)
      
      // Generate CV as image
      const canvas = await html2canvas(cvRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      })

      // Convert canvas to blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error('Gagal membuat gambar CV')
          return
        }

        const file = new File([blob], `${cvData?.personalInfo?.name || 'CV'}.png`, {
          type: 'image/png'
        })

        // Check if Web Share API supports files
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: `CV ${cvData?.personalInfo?.name || 'CV Saya'}`,
              text: `CV dari ${cvData?.personalInfo?.name || 'SmartGen CV Maker'}`,
              files: [file]
            })
            // Only show success if share was actually completed (not cancelled)
            toast.success('CV berhasil dibagikan!')
          } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
              console.error('Error sharing file:', error)
              toast.error('Gagal membagikan CV')
              fallbackShare(blob)
            }
            // If AbortError (user cancelled), don't show any message
          }
        } else {
          // Fallback: download or copy link
          fallbackShare(blob)
        }
      }, 'image/png', 0.95)
    } catch (error) {
      console.error('Error generating CV for sharing:', error)
      toast.error('Gagal membuat CV untuk dibagikan')
    } finally {
      setIsGenerating(false)
    }
  }

  const fallbackShare = (blob: Blob) => {
    // Create download link for the CV image
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${cvData?.personalInfo?.name || 'CV'}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    
    toast.success('CV tersimpan! Silakan bagikan file dari folder Download')
  }

  const handlePrint = () => {
    window.print()
  }

  if (!cvData) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
          <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Belum Ada Data CV
          </h3>
          <p className="text-gray-600 mb-6">
            Silakan lengkapi data CV Anda terlebih dahulu di tab "CV Builder"
          </p>
          <div className="flex justify-center space-x-4">
            <button
              onClick={() => window.location.href = '/#builder'}
              className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors"
            >
              Mulai Buat CV
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto w-full overflow-x-hidden">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border p-3 sm:p-6 mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-3 sm:space-y-0">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Preview CV</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              Template: {activeTemplate.charAt(0).toUpperCase() + activeTemplate.slice(1)}
            </p>
          </div>
          
          <div className="flex items-center space-x-2 sm:space-x-4 overflow-x-auto">
            {/* Preview Mode Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setPreviewMode('desktop')}
                className={`px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  previewMode === 'desktop'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Desktop
              </button>
              <button
                onClick={() => setPreviewMode('mobile')}
                className={`px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  previewMode === 'mobile'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Mobile
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handleDownloadPDF}
                disabled={isGenerating}
                className="flex items-center space-x-1 sm:space-x-2 bg-primary-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                <Download className="w-4 h-4" />
                <span>PDF</span>
              </button>
              
              <button
                onClick={handleShare}
                disabled={isGenerating}
                className="flex items-center space-x-1 sm:space-x-2 bg-green-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                <Share2 className="w-4 h-4" />
                <span className="hidden xs:inline">Share CV</span>
                <span className="xs:hidden">Share</span>
              </button>
              
              <button
                onClick={handlePrint}
                className="hidden sm:flex items-center space-x-2 bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium"
              >
                <Printer className="w-4 h-4" />
                <span>Print</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CV Preview */}
      <div className="w-full">
        <div className="w-full overflow-x-auto">
          <div 
            ref={cvRef}
            className="bg-white shadow-lg border rounded-lg mx-auto min-w-full sm:min-w-0"
            style={{ 
              minHeight: '842px', // A4 height in pixels at 96 DPI
              width: previewMode === 'mobile' ? '100%' : '794px',
              maxWidth: '100%'
            }}
          >
            {/* CV Content based on template (use normalized data to avoid merged fields) */}
            {activeTemplate === 'modern' && <ModernTemplate cvData={sanitizedCvData} />}
            {activeTemplate === 'creative' && <CreativeTemplate cvData={sanitizedCvData} />}
            {activeTemplate === 'minimalist' && <MinimalistTemplate cvData={sanitizedCvData} />}
            {activeTemplate === 'executive' && <ExecutiveTemplate cvData={sanitizedCvData} />}
            {activeTemplate === 'academic' && <AcademicTemplate cvData={sanitizedCvData} />}
            {activeTemplate === 'startup' && <StartupTemplate cvData={sanitizedCvData} />}
          </div>
        </div>
      </div>

      {/* Loading Overlay */}
      {isGenerating && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
            <span className="text-gray-900">Mengunduh CV...</span>
          </div>
        </div>
      )}
    </div>
  )
}

// Template Components
function ModernTemplate({ cvData }: { cvData: any }) {
  return (
    <div className="cv-preview-container cv-content p-3 sm:p-6 lg:p-8">
      {/* Header */}
          <div className="cv-header bg-primary-600 text-white p-3 sm:p-6 rounded-lg mb-3 sm:mb-6">
            <div>
              <h1 className="cv-text text-lg sm:text-2xl lg:text-3xl font-bold mb-2">{cvData.personalInfo?.name || 'Nama Lengkap'}</h1>
              <div className="flex flex-wrap gap-1 sm:gap-4 text-xs sm:text-sm">
                <span className="cv-text break-all">{cvData.personalInfo?.email || 'email@example.com'}</span>
                <span className="cv-text">{cvData.personalInfo?.phone || '+62 812 3456 7890'}</span>
                <span className="cv-text break-words">{cvData.personalInfo?.address || 'Alamat'}</span>
              </div>
            </div>
          </div>

      {/* Summary */}
      {cvData.personalInfo?.summary && (
        <div className="cv-section mb-3 sm:mb-6">
          <h2 className="cv-text text-base sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3 border-b-2 border-primary-600 pb-1">
            Ringkasan Profesional
          </h2>
          <p className="cv-text text-sm sm:text-base text-gray-700 leading-relaxed">{cvData.personalInfo.summary}</p>
        </div>
      )}

      {/* Experience */}
      {cvData.experience?.length > 0 && (
        <div className="cv-section mb-3 sm:mb-6">
          <h2 className="cv-text text-base sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3 border-b-2 border-primary-600 pb-1">
            Pengalaman Kerja
          </h2>
          {cvData.experience.map((exp: any, index: number) => (
            <div key={index} className="mb-2 sm:mb-4">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                <div className="flex-1">
                  <h3 className="cv-text text-sm sm:text-base font-semibold text-gray-900">{exp.position}</h3>
                  <p className="cv-text text-sm text-primary-600 font-medium">{exp.company}</p>
                </div>
                <span className="cv-text text-xs sm:text-sm text-gray-600 mt-1 sm:mt-0 sm:ml-4">{exp.duration}</span>
              </div>
              <p className="cv-text text-xs sm:text-sm text-gray-700 mt-1 sm:mt-2 leading-relaxed">{exp.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Education */}
      {cvData.education?.length > 0 && (
        <div className="cv-section mb-3 sm:mb-6">
          <h2 className="cv-text text-base sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3 border-b-2 border-primary-600 pb-1">
            Pendidikan
          </h2>
          {cvData.education.map((edu: any, index: number) => (
            <div key={index} className="mb-2 sm:mb-4">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                <div className="flex-1">
                  <h3 className="cv-text text-sm sm:text-base font-semibold text-gray-900">{edu.degree}</h3>
                  <p className="cv-text text-sm text-primary-600 font-medium">{edu.institution}</p>
                  <p className="cv-text text-xs sm:text-sm text-gray-600">{edu.field}</p>
                </div>
                <span className="cv-text text-xs sm:text-sm text-gray-600 mt-1 sm:mt-0 sm:ml-4">{edu.year}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Skills */}
      {cvData.skills?.length > 0 && (
        <div className="cv-section mb-3 sm:mb-6">
          <h2 className="cv-text text-base sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3 border-b-2 border-primary-600 pb-1">
            Keahlian
          </h2>
          <div className="flex flex-wrap gap-1 sm:gap-2">
            {cvData.skills.map((skill: any, index: number) => (
              <span key={index} className="cv-text bg-primary-100 text-primary-800 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm">
                {typeof skill === 'string' ? skill : (skill?.name || 'Skill')} {skill?.level && `(${skill?.level})`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Languages */}
      {cvData.languages?.length > 0 && (
        <div className="cv-section">
          <h2 className="cv-text text-base sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3 border-b-2 border-primary-600 pb-1">
            Bahasa
          </h2>
          <div className="flex flex-wrap gap-1 sm:gap-2">
            {cvData.languages.map((lang: any, index: number) => (
              <span key={index} className="cv-text bg-gray-100 text-gray-800 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm">
                {typeof lang === 'string' ? lang : (lang?.name || 'Language')}{' '}
                {typeof lang === 'object' && lang?.level ? `(${lang.level})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CreativeTemplate({ cvData }: { cvData: any }) {
  return (
    <div className="p-8">
      {/* Header with creative design */}
      <div className="relative mb-8">
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-8 rounded-2xl flex items-center gap-6">

          <div>
            <h1 className="text-4xl font-bold mb-2">{cvData.personalInfo?.name || 'Nama Lengkap'}</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center space-x-2">
                <span>📧</span>
                <span>{cvData.personalInfo?.email || 'email@example.com'}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span>📱</span>
                <span>{cvData.personalInfo?.phone || '+62 812 3456 7890'}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span>📍</span>
                <span>{cvData.personalInfo?.address || 'Alamat'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content with creative styling */}
      <div className="space-y-8">
        {/* Summary */}
        {cvData.personalInfo?.summary && (
          <div>
            <h2 className="text-2xl font-bold text-purple-600 mb-4">Tentang Saya</h2>
            <p className="text-gray-700 leading-relaxed">{cvData.personalInfo.summary}</p>
          </div>
        )}

        {/* Experience */}
        {cvData.experience?.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-purple-600 mb-4">Pengalaman</h2>
            {cvData.experience.map((exp: any, index: number) => (
              <div key={index} className="mb-6 p-4 bg-purple-50 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{exp.position}</h3>
                  <span className="text-sm text-purple-600 font-medium">{exp.duration}</span>
                </div>
                <p className="text-purple-600 font-medium mb-2">{exp.company}</p>
                <p className="text-gray-700">{exp.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Education */}
        {cvData.education?.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-purple-600 mb-4">Pendidikan</h2>
            {cvData.education.map((edu: any, index: number) => (
              <div key={index} className="mb-4 p-4 bg-pink-50 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{edu.degree}</h3>
                    <p className="text-purple-600 font-medium">{edu.institution}</p>
                    <p className="text-gray-600">{edu.field}</p>
                  </div>
                  <span className="text-sm text-purple-600 font-medium">{edu.year}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Skills */}
        {cvData.skills?.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-purple-600 mb-4">Keahlian</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {cvData.skills.map((skill: any, index: number) => (
                <div key={index} className="bg-gradient-to-r from-purple-100 to-pink-100 p-3 rounded-lg text-center">
                  <span className="font-medium text-gray-900">{typeof skill === 'string' ? skill : (skill?.name || 'Skill')}</span>
                  {skill?.level && <span className="text-sm text-purple-600 block">({skill?.level})</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Languages (ensure rendered separately) */}
        {cvData.languages?.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-purple-600 mb-4">Bahasa</h2>
            <div className="flex flex-wrap gap-2">
              {cvData.languages.map((lang: any, index: number) => (
                <span key={index} className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm">
                  {typeof lang === 'string' ? lang : (lang?.name || 'Language')}{' '}
                  {typeof lang === 'object' && lang?.level ? `(${lang.level})` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MinimalistTemplate({ cvData }: { cvData: any }) {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
            <div>
              <h1 className="text-4xl font-light text-gray-900 mb-2">{cvData.personalInfo?.name || 'Nama Lengkap'}</h1>
              <div className="text-gray-600 space-y-1">
                <p>{cvData.personalInfo?.email || 'email@example.com'}</p>
                <p>{cvData.personalInfo?.phone || '+62 812 3456 7890'}</p>
                <p>{cvData.personalInfo?.address || 'Alamat'}</p>
              </div>
            </div>
      </div>

      {/* Content */}
      <div className="space-y-8">
        {/* Summary */}
        {cvData.personalInfo?.summary && (
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-3 border-b border-gray-300 pb-1">
              Ringkasan
            </h2>
            <p className="text-gray-700 leading-relaxed">{cvData.personalInfo.summary}</p>
          </div>
        )}

        {/* Experience */}
        {cvData.experience?.length > 0 && (
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-3 border-b border-gray-300 pb-1">
              Pengalaman
            </h2>
            {cvData.experience.map((exp: any, index: number) => (
              <div key={index} className="mb-4">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-medium text-gray-900">{exp.position}</h3>
                  <span className="text-sm text-gray-600">{exp.duration}</span>
                </div>
                <p className="text-gray-600 mb-2">{exp.company}</p>
                <p className="text-gray-700 text-sm">{exp.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Education */}
        {cvData.education?.length > 0 && (
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-3 border-b border-gray-300 pb-1">
              Pendidikan
            </h2>
            {cvData.education.map((edu: any, index: number) => (
              <div key={index} className="mb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-gray-900">{edu.degree}</h3>
                    <p className="text-gray-600">{edu.institution}</p>
                    <p className="text-gray-500 text-sm">{edu.field}</p>
                  </div>
                  <span className="text-sm text-gray-600">{edu.year}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Languages */}
        {cvData.languages?.length > 0 && (
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-3 border-b border-gray-300 pb-1">Bahasa</h2>
            <div className="flex flex-wrap gap-2">
              {cvData.languages.map((lang: any, index: number) => (
                <span key={index} className="text-sm text-gray-700 border border-gray-300 px-2 py-1 rounded">
                  {typeof lang === 'string' ? lang : (lang?.name || 'Language')}{' '}
                  {typeof lang === 'object' && lang?.level ? `(${lang.level})` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {cvData.skills?.length > 0 && (
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-3 border-b border-gray-300 pb-1">
              Keahlian
            </h2>
            <div className="flex flex-wrap gap-2">
              {cvData.skills.map((skill: any, index: number) => (
                <span key={index} className="text-sm text-gray-700 border border-gray-300 px-2 py-1 rounded">
                  {typeof skill === 'string' ? skill : (skill?.name || "Skill")}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ExecutiveTemplate({ cvData }: { cvData: any }) {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="border-b-4 border-gray-800 pb-6 mb-6">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">{cvData.personalInfo?.name || 'Nama Lengkap'}</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-gray-600">
            <div>{cvData.personalInfo?.email || 'email@example.com'}</div>
            <div>{cvData.personalInfo?.phone || '+62 812 3456 7890'}</div>
            <div>{cvData.personalInfo?.address || 'Alamat'}</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-8">
        {/* Summary */}
        {cvData.personalInfo?.summary && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Executive Summary</h2>
            <p className="text-gray-700 leading-relaxed text-lg">{cvData.personalInfo.summary}</p>
          </div>
        )}

        {/* Experience */}
        {cvData.experience?.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Professional Experience</h2>
            {cvData.experience.map((exp: any, index: number) => (
              <div key={index} className="mb-6">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{exp.position}</h3>
                    <p className="text-lg text-gray-600">{exp.company}</p>
                  </div>
                  <span className="text-gray-600">{exp.duration}</span>
                </div>
                <p className="text-gray-700 leading-relaxed">{exp.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Education */}
        {cvData.education?.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Education</h2>
            {cvData.education.map((edu: any, index: number) => (
              <div key={index} className="mb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{edu.degree}</h3>
                    <p className="text-gray-600">{edu.institution}</p>
                    <p className="text-gray-500">{edu.field}</p>
                  </div>
                  <span className="text-gray-600">{edu.year}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Skills */}
        {cvData.skills?.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Core Competencies</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {cvData.skills.map((skill: any, index: number) => (
                <div key={index} className="bg-gray-100 p-3 rounded">
                  <span className="font-medium text-gray-900">{typeof skill === 'string' ? skill : (skill?.name || "Skill")}</span>
                  {skill?.level && <span className="text-gray-600 text-sm block">({skill?.level})</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Languages */}
        {cvData.languages?.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Bahasa</h2>
            <div className="flex flex-wrap gap-2">
              {cvData.languages.map((lang: any, index: number) => (
                <span key={index} className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm">
                  {typeof lang === 'string' ? lang : (lang?.name || 'Language')}{' '}
                  {typeof lang === 'object' && lang?.level ? `(${lang.level})` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AcademicTemplate({ cvData }: { cvData: any }) {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{cvData.personalInfo?.name || 'Nama Lengkap'}</h1>
        <div className="text-gray-600 space-y-1">
          <p>{cvData.personalInfo?.email || 'email@example.com'}</p>
          <p>{cvData.personalInfo?.phone || '+62 812 3456 7890'}</p>
          <p>{cvData.personalInfo?.address || 'Alamat'}</p>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-8">
        {/* Summary */}
        {cvData.personalInfo?.summary && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Research Interests</h2>
            <p className="text-gray-700 leading-relaxed">{cvData.personalInfo.summary}</p>
          </div>
        )}

        {/* Education */}
        {cvData.education?.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Education</h2>
            {cvData.education.map((edu: any, index: number) => (
              <div key={index} className="mb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900">{edu.degree}</h3>
                    <p className="text-gray-600">{edu.institution}</p>
                    <p className="text-gray-500 text-sm">{edu.field}</p>
                  </div>
                  <span className="text-sm text-gray-600">{edu.year}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Experience */}
        {cvData.experience?.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Professional Experience</h2>
            {cvData.experience.map((exp: any, index: number) => (
              <div key={index} className="mb-4">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-semibold text-gray-900">{exp.position}</h3>
                  <span className="text-sm text-gray-600">{exp.duration}</span>
                </div>
                <p className="text-gray-600 mb-2">{exp.company}</p>
                <p className="text-gray-700 text-sm">{exp.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Skills */}
        {cvData.skills?.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Technical Skills</h2>
            <div className="flex flex-wrap gap-2">
              {cvData.skills.map((skill: any, index: number) => (
                <span key={index} className="bg-gray-100 text-gray-800 px-3 py-1 rounded text-sm">
                  {typeof skill === 'string' ? skill : (skill?.name || "Skill")}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Languages */}
        {cvData.languages?.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Bahasa</h2>
            <div className="flex flex-wrap gap-2">
              {cvData.languages.map((lang: any, index: number) => (
                <span key={index} className="bg-gray-100 text-gray-800 px-3 py-1 rounded text-sm">
                  {typeof lang === 'string' ? lang : (lang?.name || 'Language')}{' '}
                  {typeof lang === 'object' && lang?.level ? `(${lang.level})` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StartupTemplate({ cvData }: { cvData: any }) {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-lg mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">{cvData.personalInfo?.name || 'Nama Lengkap'}</h1>
          <div className="flex flex-wrap gap-4 text-sm">
            <span>📧 {cvData.personalInfo?.email || 'email@example.com'}</span>
            <span>📱 {cvData.personalInfo?.phone || '+62 812 3456 7890'}</span>
            <span>📍 {cvData.personalInfo?.address || 'Alamat'}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6">
        {/* Summary */}
        {cvData.personalInfo?.summary && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">About</h2>
            <p className="text-gray-700">{cvData.personalInfo.summary}</p>
          </div>
        )}

        {/* Experience */}
        {cvData.experience?.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Experience</h2>
            {cvData.experience.map((exp: any, index: number) => (
              <div key={index} className="mb-4 p-4 bg-blue-50 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-gray-900">{exp.position}</h3>
                  <span className="text-sm text-blue-600">{exp.duration}</span>
                </div>
                <p className="text-blue-600 font-medium mb-2">{exp.company}</p>
                <p className="text-gray-700 text-sm">{exp.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Education */}
        {cvData.education?.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Education</h2>
            {cvData.education.map((edu: any, index: number) => (
              <div key={index} className="mb-4 p-4 bg-purple-50 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900">{edu.degree}</h3>
                    <p className="text-purple-600 font-medium">{edu.institution}</p>
                    <p className="text-gray-600 text-sm">{edu.field}</p>
                  </div>
                  <span className="text-sm text-purple-600">{edu.year}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Skills */}
        {cvData.skills?.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Skills</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {cvData.skills.map((skill: any, index: number) => (
                <div key={index} className="bg-gradient-to-r from-blue-100 to-purple-100 p-3 rounded-lg text-center">
                  <span className="font-medium text-gray-900">{typeof skill === 'string' ? skill : (skill?.name || "Skill")}</span>
                  {skill?.level && <span className="text-sm text-blue-600 block">({skill?.level})</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Languages */}
        {cvData.languages?.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Bahasa</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {cvData.languages.map((lang: any, index: number) => (
                <div key={index} className="bg-gray-50 p-2 rounded text-center text-sm">
                  {typeof lang === 'string' ? lang : (lang?.name || 'Language')}
                  {typeof lang === 'object' && lang?.level && <div className="text-xs text-gray-600">{lang.level}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DefaultTemplate({ cvData }: { cvData: any }) {
  return <ModernTemplate cvData={cvData} />
}

