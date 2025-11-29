'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { 
  FileText, 
  MessageSquare, 
  Download, 
  Settings, 
  LogOut,
  Plus,
  Eye,
  Edit,
  Sparkles,
  Save,
  Check,
  History
} from 'lucide-react'
import AIChat from './AIChat'
import CVBuilder from './CVBuilder'
import TemplateSelector from './TemplateSelector'
import CVPreview from './CVPreview'
import CVSelector from './CVSelector'
import CVHistoryPanel from './CVHistoryPanel'
// import PWAInstallPrompt from './PWAInstallPrompt'
// import PWAStatus from './PWAStatus'
// import ServiceWorkerRegistration from './ServiceWorkerRegistration'
import { useCVData } from '@/hooks/useCVData'

type TabType = 'chat' | 'builder' | 'templates' | 'photo' | 'preview'

interface DashboardProps {
  onLogout?: () => void
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const { data: session } = useSession()
  // Initialize activeTab from localStorage immediately
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (typeof window !== 'undefined') {
      const savedTab = localStorage.getItem('activeTab')
      return (savedTab as TabType) || 'chat'
    }
    return 'chat'
  })
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [showHistory, setShowHistory] = useState(false)
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Use MySQL database via Prisma for CV data
  const {
    cvData,
    setCVData,
    allCVs,
    isLoading,
    isSaving,
    lastSaved,
    createCV,
    updateCV,
    deleteCV,
    autoSave,
    fetchCV,
  } = useCVData()
  
  // Load template from CV data when CV changes
  useEffect(() => {
    try {
      if (cvData?.template?.id) {
        setSelectedTemplate(cvData.template.id)
      } else if (cvData && !cvData.template) {
        // Set default template if CV exists but has no template
        setSelectedTemplate('modern')
      }
    } catch (error) {
      console.error('Error loading template:', error)
      setSelectedTemplate('modern') // Fallback to modern
    }
  }, [cvData?._id, cvData?.template?.id])

  // Save active tab to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab)
  }, [activeTab])

  // Cleanup auto-save timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [])

  const handleLogout = async () => {
    // Clear localStorage
    if (onLogout) {
      onLogout()
    }
    // Sign out from NextAuth if there's a session
    if (session) {
      await signOut({ redirect: false })
    }
  }

  const tabs = [
    { id: 'chat', label: 'AI Assistant', icon: MessageSquare },
    { id: 'builder', label: 'CV Builder', icon: FileText },
    { id: 'templates', label: 'Templates', icon: Eye },
    { id: 'preview', label: 'Preview', icon: Download },
  ]

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
  }

  const handleCVDataUpdate = (data: any) => {
    console.log('Received CV data update:', data)
    
    // Merge new data with existing data (don't overwrite existing fields)
    // Remove duplicates by checking if item already exists
    const existingExperiences = cvData?.experiences || []
    const newExperiences = data?.experiences || data?.experience || []
    const mergedExperiences = [...existingExperiences]
    
    // Only add new experiences that don't already exist
    newExperiences.forEach((newExp: any) => {
      const isDuplicate = existingExperiences.some((existing: any) => 
        existing.company === newExp.company && existing.position === newExp.position
      )
      if (!isDuplicate) {
        mergedExperiences.push(newExp)
      }
    })
    
    const existingEducation = cvData?.education || []
    const newEducation = data?.education || []
    const mergedEducation = [...existingEducation]
    
    // Only add new education that don't already exist
    newEducation.forEach((newEdu: any) => {
      const isDuplicate = existingEducation.some((existing: any) => 
        existing.institution === newEdu.institution && existing.field === newEdu.field
      )
      if (!isDuplicate) {
        mergedEducation.push(newEdu)
      }
    })
    
    const existingSkills = cvData?.skills || []
    const newSkills = data?.skills || []
    const mergedSkills = Array.from(new Set([...existingSkills, ...newSkills])) // Remove duplicate skills
    
    const mergedData = {
      title: cvData?.title || 'My CV',
      personalInfo: {
        ...(cvData?.personalInfo || {}),
        ...(data?.personalInfo || {})
      },
      experiences: mergedExperiences,
      education: mergedEducation,
      skills: mergedSkills,
      template: cvData?.template || data?.template || { id: 'modern', name: 'Modern' }
    }
    
    console.log('Merged CV data:', mergedData)
    setCVData(mergedData)
    
    // Save to localStorage immediately (instant backup)
    localStorage.setItem('currentCV', JSON.stringify(mergedData))
    
    // Auto-save to MySQL database via API (debounced)
    if (mergedData && session?.user?.email) {
      // Clear existing timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
      
      // Set new timeout
      autoSaveTimeoutRef.current = setTimeout(() => {
        autoSave(mergedData) // Use merged data, not the raw input
      }, 2000) // Save after 2 seconds of inactivity
    }
  }

  const handlePhotoChange = (photoDataUrl: string) => {
    if (cvData) {
      const updatedCVData = {
        ...cvData,
        personalInfo: {
          ...cvData.personalInfo,
          photo: photoDataUrl
        }
      }
      setCVData(updatedCVData)
      localStorage.setItem('currentCV', JSON.stringify(updatedCVData))
      toast.success('Foto berhasil disimpan ke CV')
      
      // Auto-save with timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
      autoSaveTimeoutRef.current = setTimeout(() => {
        autoSave(updatedCVData)
      }, 1000)
    }
  }

  const handleTemplateSelect = (template: string) => {
    console.log('Template selected:', template)
    setSelectedTemplate(template)
    
    // IMPORTANT: Preserve ALL existing data, only update template
    if (cvData) {
      const updatedData = {
        ...cvData, // Keep ALL existing data
        template: {
          id: template,
          name: template.charAt(0).toUpperCase() + template.slice(1)
        }
      }
      handleCVDataUpdate(updatedData)
    } else {
      // If no data yet, create minimal structure
      const newData = {
        title: 'My CV',
        personalInfo: {},
        experiences: [],
        education: [],
        skills: [],
        template: {
          id: template,
          name: template.charAt(0).toUpperCase() + template.slice(1)
        }
      }
      setCVData(newData)
      localStorage.setItem('currentCV', JSON.stringify(newData))
    }
    
    // Redirect to Preview to see the result
    setActiveTab('preview')
    toast.success(`Template "${template}" dipilih! Lihat hasilnya di Preview.`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold text-gray-900">SmartGen CV Maker</h1>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Save Status Indicator */}
              {session?.user?.email && (
                <div className="flex items-center space-x-2">
                  {isSaving ? (
                    <>
                      <Save className="w-4 h-4 text-blue-500 animate-pulse" />
                      <span className="text-xs text-gray-500">Saving...</span>
                    </>
                  ) : lastSaved ? (
                    <>
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="text-xs text-gray-500">
                        Saved {new Date(lastSaved).toLocaleTimeString()}
                      </span>
                    </>
                  ) : null}
                </div>
              )}
              
              <div className="flex items-center space-x-3">
                <img
                  src={session?.user?.image || '/default-avatar.png'}
                  alt={session?.user?.name || 'User'}
                  className="w-8 h-8 rounded-full"
                />
                <span className="text-sm font-medium text-gray-700">
                  {session?.user?.name || 'Demo User'}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <nav className="flex space-x-8">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id as TabType)}
                    className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'border-primary-500 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </nav>
            
            {/* CV Selector & History - Show on builder tab */}
            {session?.user?.email && activeTab === 'builder' && (
              <div className="flex items-center space-x-3">
                {/* History Button */}
                {cvData?._id && (
                  <button
                    onClick={() => setShowHistory(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    title="View version history"
                  >
                    <History className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">History</span>
                  </button>
                )}
                
                {/* CV Selector */}
                <CVSelector
                  cvs={allCVs}
                  currentCV={cvData}
                  onSelect={(cv) => {
                    setCVData(cv as any)
                    localStorage.setItem('currentCV', JSON.stringify(cv))
                  }}
                  onCreateNew={async () => {
                    const newCV = await createCV({
                      title: `CV - ${new Date().toLocaleDateString()}`,
                      personalInfo: {
                        fullName: session?.user?.name || '',
                        email: session?.user?.email || '',
                      },
                      experiences: [],
                      education: [],
                      skills: [],
                      template: {
                        id: 'modern',
                        name: 'Modern',
                      },
                    })
                    if (newCV) {
                      setCVData(newCV)
                      localStorage.setItem('currentCV', JSON.stringify(newCV))
                    }
                  }}
                  onDelete={async (id) => {
                    const success = await deleteCV(id)
                    if (success && cvData?._id === id) {
                      // If deleted current CV, load first available CV or null
                      const remainingCVs = allCVs.filter(cv => cv._id !== id)
                      if (remainingCVs.length > 0) {
                        setCVData(remainingCVs[0])
                        localStorage.setItem('currentCV', JSON.stringify(remainingCVs[0]))
                      } else {
                        setCVData(null)
                        localStorage.removeItem('currentCV')
                      }
                    }
                  }}
                  isLoading={isLoading}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'chat' && (
            <AIChat onCVDataUpdate={handleCVDataUpdate} />
          )}
          
          {activeTab === 'builder' && (
            <CVBuilder 
              cvData={cvData} 
              template={selectedTemplate}
              onDataUpdate={handleCVDataUpdate}
            />
          )}
          
          {activeTab === 'templates' && (
            <TemplateSelector onTemplateSelect={handleTemplateSelect} />
          )}
          
          {activeTab === 'preview' && (
            <CVPreview 
              cvData={cvData} 
              template={selectedTemplate}
              onClear={() => {
                setCVData(null)
                localStorage.removeItem('currentCV')
                setActiveTab('builder')
              }}
            />
          )}
        </motion.div>
      </main>

      {/* History Panel Modal */}
      {showHistory && cvData?._id && (
        <CVHistoryPanel
          cvId={cvData._id}
          onRestore={(restoredData) => {
            setCVData(restoredData)
            localStorage.setItem('currentCV', JSON.stringify(restoredData))
          }}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* PWA Components */}
      {/* <PWAStatus /> */}
      {/* <PWAInstallPrompt /> */}
      {/* <ServiceWorkerRegistration /> */}
    </div>
  )
}

