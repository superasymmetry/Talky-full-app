import json
import unittest
import requests
from playwright.sync_api import sync_playwright
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'utils')))
from utils import generate_test_sound

testtext = "the quick brown fox jumps over the lazy dog"
testpath = os.path.join(os.path.dirname(__file__), '..', 'testfiles', 'testsound.wav')

class TestLesson(unittest.TestCase):
    def setUp(self):
        generate_test_sound(testtext, testpath)

        with open(testpath, 'rb') as f:
            res = requests.post(
            "http://localhost:8080/api/record/test",
            files={"audio": ("testsound.wav", f, "audio/wav")},
            data={"card": testtext}
        )
        
        self.mock_response = res.json()

    def test_phoneme_colors_and_tooltip(self):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=False)
            page = browser.new_page()

            page.route("**/api/record/test", lambda route: route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(self.mock_response)
            ))

            page.goto("http://localhost:5173/lessons/1")
            page.click("text=Start Lesson")
            page.wait_for_selector("text=Say this sentence:")
            page.wait_for_function("() => !document.querySelector('div[style*=\"font-weight\"]')?.innerText.includes('Loading...')")
            page.wait_for_timeout(1500)
            sentence = page.locator("text=Say this sentence:").locator("xpath=following-sibling::div[1]").inner_text()
            print("sentence is", sentence)
            generate_test_sound(sentence, testpath)

            page.click("text=Record")
            page.wait_for_timeout(10000)
            page.wait_for_selector("span[title*='Score:']", timeout=10000)
            scored_phonemes = page.locator("span[title*='Score:']")
            self.assertGreater(scored_phonemes.count(), 10)

            browser.close()

if __name__ == "__main__":
    unittest.main()