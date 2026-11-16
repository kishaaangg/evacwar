fetch('http://127.0.0.1:8080/api/lora/chat')
  .then(res => res.json())
  .then(data => {
    console.log('Total messages:', data.messages.length);
    const recent = data.messages.slice(-15);
    recent.forEach(m => {
      console.log(`seq: ${m.seq} | id: ${m.id} | role: ${m.senderRole} | text: "${m.text}" | sent_at: ${m.sent_at}`);
    });
  })
  .catch(err => console.error(err));
