import { Routes, Route, Navigate, useParams, Outlet, useSearchParams } from 'react-router-dom'
import { useAppClients } from './lib/queries'

import AppLayout from './components/AppLayout'
import AuthPage from './features/auth/AuthPage'
import FormFillPage from './features/forms/FormFillPage'
import FormDocumentPage from './features/forms/FormDocumentPage'
import FormStartPage from './features/forms/FormStartPage'
import Home from './features/home/HomePage'
import Calendar from './features/calendar/CalendarPage'
import AllClients from './components/AllClients'
import ScreenerPage from './components/ScreenerPage'
import AddClient from './components/AddClient'
import PatientProfile from './features/client/PatientProfile'
import ClientPanelEmpty from './features/client/ClientPanelEmpty'
import ProgressNotesPage from './features/client/ProgressNotesPage'
import ProgressNotesRedirect from './features/client/ProgressNotesRedirect'
import LettersPanel from './features/client/LettersPanel'
import CaseHistoryPanel from './features/client/CaseHistoryPanel'
import ClientDocumentsPage from './features/client/ClientDocumentsPage'
import ClientAppointmentsIndex from './features/client/ClientAppointmentsIndex'
import ClientSupportActivities from './features/client/ClientSupportActivities'
import AppointmentEditor from './features/client/AppointmentEditor'
import ClientSectionPlaceholder from './features/client/ClientSectionPlaceholder'
import SettingsLayout from './features/settings/SettingsLayout'
import AccountSettingsPage from './features/settings/AccountSettingsPage'
import AvailabilitySettingsPage from './features/settings/AvailabilitySettingsPage'
import ServicesSettingsPage from './features/settings/ServicesSettingsPage'
import IntegrationsSettingsPage from './features/settings/IntegrationsSettingsPage'
import { TwoFactorSettingsPage } from './features/settings/SettingsPlaceholders'
import FormsSettingsPage from './features/settings/FormsSettingsPage'
import TagsSettingsPage from './features/settings/TagsSettingsPage'
import FormDesignerPage from './features/settings/FormDesignerPage'
import MeasureDesignerPage from './features/settings/MeasureDesignerPage'
import TemplatesSettingsPage from './features/settings/TemplatesSettingsPage'
import JournalPage from './features/journal/JournalPage'
import PracticeLayout from './features/practice/PracticeLayout'
import PracticeDocumentsPage from './features/practice/PracticeDocumentsPage'
import PracticeLogPage from './features/practice/PracticeLogPage'
import Resources from './components/Resources'
import About from './components/About'
import NotesHistoryPanel from './features/client/NotesHistoryPanel'
import ReportingPage from './features/reporting/ReportingPage'
import FinancePage from './features/finance/FinancePage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/f/:token" element={<FormFillPage />} />
      <Route path="/r/:formId" element={<FormStartPage />} />
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/dashboard" element={<Navigate to="/home" replace />} />
      <Route path="/profile" element={<Navigate to="/settings/account" replace />} />
      <Route path="/profile/*" element={<Navigate to="/settings/account" replace />} />
      <Route path="/workplace" element={<Navigate to="/home" replace />} />

      <Route element={<AppLayout />}>
        <Route path="home" element={<Home />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="reporting" element={<ReportingPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="journal" element={<Navigate to="/practice/journal" replace />} />
        <Route path="practice" element={<PracticeLayout />}>
          <Route index element={<Navigate to="journal" replace />} />
          <Route path="documents" element={<PracticeDocumentsPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="cpd" element={<PracticeLogPage kind="cpd" />} />
          <Route path="supervision" element={<PracticeLogPage kind="supervision" />} />
        </Route>
        <Route path="lab/progress-note" element={<Navigate to="/home" replace />} />
        <Route path="upcoming-appointments" element={<Navigate to="/calendar?view=upcoming" replace />} />
        <Route path="active-cases" element={<Navigate to="/home" replace />} />
        <Route path="clients" element={<AllClients />} />
        <Route path="screener" element={<ScreenerPage />} />
        <Route path="waitlist" element={<Navigate to="/screener" replace />} />
        <Route path="clients/:clientId/forms/:submissionId" element={<FormDocumentPage />} />
        <Route path="clients/add" element={<AddClient />} />
        <Route path="clients/:clientId/edit" element={<AddClient />} />

        <Route path="clients/:clientId/progress-notes" element={<ProgressNotesClientShell />}>
          <Route index element={<ProgressNotesPage />} />
        </Route>
        <Route path="clients/:clientId/progress-notes/new" element={<ProgressNotesRedirect />} />
        <Route path="clients/:clientId/progress-notes/:noteId" element={<ProgressNotesRedirect />} />

        <Route path="clients/:id/notes/new" element={<LegacyNoteRedirect />} />
        <Route path="clients/:id/notes/:noteId" element={<LegacyNoteRedirect />} />

        <Route path="clients/:id" element={<PatientProfileWrapper />}>
          <Route index element={<ClientPanelEmpty />} />
          <Route path="appointments" element={<ClientAppointmentsIndex />}>
            <Route path="new" element={<AppointmentEditor />} />
            <Route path=":appointmentId" element={<AppointmentEditor />} />
          </Route>
          <Route path="support" element={<ClientSupportActivities />} />
          <Route path="notes-history" element={<NotesHistoryPanel />} />
          <Route path="case-history" element={<CaseHistoryPanel />} />
          <Route path="letters" element={<LettersPanel />} />
          <Route path="files" element={
            <ClientSectionPlaceholder
              title="Files"
              newLabel="file"
              columns={[
                { key: 'name', label: 'File name' },
                { key: 'type', label: 'Type' },
                { key: 'date', label: 'Uploaded' },
              ]}
            />
          } />
          <Route path="documents" element={<ClientDocumentsPage />} />
          <Route path="contacts" element={
            <ClientSectionPlaceholder
              title="Contacts"
              newLabel="contact"
              columns={[
                { key: 'name', label: 'Name' },
                { key: 'role', label: 'Relationship' },
                { key: 'phone', label: 'Phone' },
                { key: 'email', label: 'Email' },
              ]}
            />
          } />
          <Route path="forms" element={<Navigate to="../case-history" replace />} />
          <Route path="outcomes" element={<Navigate to="../case-history" replace />} />
        </Route>

        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="account" replace />} />
          <Route path="account" element={<AccountSettingsPage />} />
          <Route path="availability" element={<AvailabilitySettingsPage />} />
          <Route path="services" element={<ServicesSettingsPage />} />
          <Route path="templates" element={<Navigate to="progress-notes" replace />} />
          <Route path="templates/progress-notes" element={
            <TemplatesSettingsPage kind="progress_note" title="Process Note templates" />
          } />
          <Route path="templates/letters" element={
            <TemplatesSettingsPage kind="letter" title="Letter templates" />
          } />
          <Route path="templates/reports" element={
            <TemplatesSettingsPage kind="report" title="Report templates" />
          } />
          <Route path="templates/working-documents" element={
            <TemplatesSettingsPage kind="working_document" title="Working document templates" />
          } />
          <Route path="forms" element={<FormsSettingsPage />} />
          <Route path="tags" element={<TagsSettingsPage />} />
          <Route path="forms/edit/:formId" element={<FormDesignerPage />} />
          <Route path="forms/questionnaires/:measureId" element={<MeasureDesignerPage />} />
          <Route path="login" element={<Navigate to="/settings/account" replace />} />
          <Route path="password" element={<Navigate to="/settings/account" replace />} />
          <Route path="2fa" element={<TwoFactorSettingsPage />} />
          <Route path="integrations" element={<IntegrationsSettingsPage />} />
        </Route>
        <Route path="resources" element={<Resources />} />
        <Route path="about" element={<About />} />
      </Route>
    </Routes>
  )
}

function ProgressNotesClientShell() {
  const { clientId } = useParams()
  const { clients } = useAppClients()
  const client = clients?.find(c => c.id === clientId)
  if (!client) {
    return (
      <div className="page">
        <div className="card empty-state">Client not found or access denied.</div>
      </div>
    )
  }
  return <Outlet context={{ client }} />
}

function PatientProfileWrapper() {
  const { id } = useParams()
  const { clients } = useAppClients()
  const client = clients.find(c => c.id === id)
  if (!client) return <div className="card empty-state">Client not found or access denied.</div>
  return <PatientProfile client={client} />
}

function LegacyNoteRedirect() {
  const { id, noteId } = useParams()
  const [searchParams] = useSearchParams()
  const appointment = searchParams.get('appointment')
  if (appointment) {
    return <Navigate to={`/clients/${id}/progress-notes?appointment=${appointment}`} replace />
  }
  const suffix = noteId && noteId !== 'new' ? noteId : null
  if (suffix) {
    return <Navigate to={`/clients/${id}/progress-notes/${suffix}`} replace />
  }
  return <Navigate to={`/clients/${id}/progress-notes/new`} replace />
}
