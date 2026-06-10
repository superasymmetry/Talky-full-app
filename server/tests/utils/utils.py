def generate_test_sound(text, path):
    from gtts import gTTS
    myobj = gTTS(text=text, lang='en', slow=True)
    myobj.save(path)
