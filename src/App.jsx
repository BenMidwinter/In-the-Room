import { Routes, Route, Navigate, useParams, Outlet, useSearchParams } from 'react-router-dom'
import { useAppClients } from './lib/queries'

import AppLayout from './components/AppLayout'
import Home from './features/home/HomePage'
import Calendar from './features/calendar/CalendarPage'
import ActiveCases from './components/ActiveCases'
import AllClients from './components/AllClients'
import AddClient from './components/AddClient'
import PatientProfile from './features/client/PatientProfile'
import ClientPanelEmpty from './features/client/ClientPanelEmpty'
import ProgressNotesPage from './features/client/ProgressNotesPage'
import ProgressNotesRedirect from './features/client/ProgressNotesRedirect'
import WorkingDocumentsPanel from './features/client/WorkingDocumentsPanel'
import LettersPanel from './features/client/LettersPanel'
import CaseHistoryPanel from './features/client/CaseHistoryPanel'
import UpcomingAppointments from './components/UpcomingAppointments'
import ClientAppointmentsIndex from './features/client/ClientAppointmentsIndex'
import AppointmentEditor from './features/client/AppointmentEditor'
import ClientSectionPlaceholder from './features/client/ClientSectionPlaceholder'
import ProfileLayout from './features/profile/ProfileLayout'
import ProfileDetails from './features/profile/ProfileDetails'
import ClinicianJournal from './features/profile/ClinicianJournal'
import Resources from './components/Resources'
import About from './components/About'
import NotesHistoryPanel from './features/client/NotesHistoryPanel'
import Reporting from './components/Reporting'
import FinancePage from './features/finance/FinancePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/dashboard" element={<Navigate to="/home" replace />} />
      <Route path="/settings" element={<Navigate to="/profile" replace />} />
      <Route path="/workplace" element={<Navigate to="/home" replace />} />
      <Route path="/service-lead/*" element={<Navigate to="/home" replace />} />

      <Route element={<AppLayout />}>
        <Route path="home" element={<Home />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="reporting" element={<Reporting />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="upcoming-appointments" element={<UpcomingAppointments />} />
        <Route path="active-cases" element={<ActiveCases />} />
        <Route path="clients" element={<AllClients />} />
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
          <Route path="appointments" element={<ClientAppointmentsIndex />} />
          <Route path="appointments/new" element={<AppointmentEditor />} />
          <Route path="appointments/:appointmentId" element={<AppointmentEditor />} />
          <Route path="notes-history" element={<NotesHistoryPanel />} />
          <Route path="case-history" element={<CaseHistoryPanel />} />
          <Route path="letters" element={<LettersPanel />} />
          <Route path="files" element={
            <ClientSectionPlaceholder
              title="Files"
              description="Uploaded files and attachments for this client."
              newLabel="file"
              columns={[
                { key: 'name', label: 'File name' },
                { key: 'type', label: 'Type' },
                { key: 'date', label: 'Uploaded' },
                { key: 'author', label: 'Uploaded by' },
              ]}
            />
          } />
          <Route path="documents" element={<WorkingDocumentsPanel />} />
          <Route path="contacts" element={
            <ClientSectionPlaceholder
              title="Contacts"
              description="Parents, carers, referrers, and other key contacts linked to this client."
              newLabel="contact"
              columns={[
                { key: 'name', label: 'Name' },
                { key: 'role', label: 'Relationship' },
                { key: 'phone', label: 'Phone' },
                { key: 'email', label: 'Email' },
              ]}
            />
          } />
          <Route path="forms" element={
            <ClientSectionPlaceholder
              title="Forms"
              description="Referrals, consent forms, and other structured records for this client."
              newLabel="form"
              columns={[
                { key: 'name', label: 'Form' },
                { key: 'status', label: 'Status' },
                { key: 'date', label: 'Completed' },
                { key: 'author', label: 'Recorded by' },
              ]}
            />
          } />
          <Route path="outcomes" element={
            <ClientSectionPlaceholder
              title="Outcome measures"
              description="Standardised outcome tracking and measurement tools will be recorded here."
              newLabel="outcome measure"
              columns={[
                { key: 'name', label: 'Measure' },
                { key: 'score', label: 'Score' },
                { key: 'date', label: 'Date' },
                { key: 'author', label: 'Recorded by' },
              ]}
            />
          } />
        </Route>

        <Route path="profile" element={<ProfileLayout />}>
          <Route index element={<ProfileDetails />} />
          <Route path="journal" element={<ClinicianJournal />} />
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
