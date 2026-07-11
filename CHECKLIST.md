# Manual E2E Checklist

- [ ] Chrome: load unpacked extension successfully
- [ ] Chrome: popup opens and shows idle state
- [ ] Edge: load unpacked extension successfully
- [ ] Edge: popup opens and shows idle state
- [ ] Short session under 3 minutes records a single chunk
- [ ] Long session over 6 minutes records multiple chunks
- [ ] Audio remains audible during recording
- [ ] Start button stays disabled without a saved API key
- [ ] Start button stays disabled without consent checked
- [ ] Closing the lecture tab stops or finalizes the session safely
- [ ] Simulated network/API error moves the session to error state
- [ ] Popup close and reopen preserves session state
- [ ] Notes can be re-downloaded after popup close/reopen
- [ ] Transcript can be re-downloaded after popup close/reopen
- [ ] Cancel/Discard cleans up in-progress recording state
- [ ] Badge is cleared after cancel or clear session
- [ ] Badge changes to recording state during capture
- [ ] Badge changes to success or error after processing
