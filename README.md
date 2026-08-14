# Talky!

The Duolingo for speech therapy–we're making better speech accessible to all, without the crazy costs.

[<img src="https://i.postimg.cc/L4wPdG9N/join-2.png" height="20">](https://discord.gg/UfbueJPr)
[![GitHub Stars](https://img.shields.io/github/stars/superasymmetry/Talky-full-app?style=social)](https://github.com/superasymmetry/Talky-full-app)
[![GitHub Issues](https://img.shields.io/github/issues/superasymmetry/Talky-full-app)](https://github.com/superasymmetry/Talky-full-app/issues)

<img src="https://github.com/user-attachments/assets/f0668ef6-f12f-4eb9-8087-b06f4b2c8c6b" width="80" alt="Talky Logo">

## Table of contents
- [What is Talky?](#what-is-talky)
- [How is Talky made?](#how)
- [Features](#features)
- [Getting Started](#getting-started)
- [Contributing](#contributing)
- [License](#license)
- [Credits](#credits)

<a id="what-is-talky"></a>
## What is Talky?
1 in 14 US children and over 3 million US adults have some sort of speech impediment. However, solutions to mitigate these impediments often have extremely high costs, with many services being over $1000 per month. We want to fix that for those who need it. Talky is an open-source, gamified speech evaluator to help you improve your speaking and pronounciation. With lessons and targeted practice exercises covering all common phoneme mispronounciations, and a [scientifically-backed](#credits) method for giving a detailed phoneme-level pronounciation score to each sentence spoken.

https://github.com/user-attachments/assets/9bdbffd5-ac85-45cc-8389-98225c5bfa61

<a id="how"></a>
## How is Talky made?
Talky is made with many different technologies. Here we credit the major ones we've used.
- **Our main feature is our Goodness of Pronounciation Algorithm ([this](#credits) Huggingface model, [this](#credits) algorithm for evaluation, and the forced alignment algorithm). I wrote about how we did this on my [personal website](https://cszeng.vercel.app/projects/2_talky/), and I have also open-sourced my approach here as a [PyPI library](http://github.com/superasymmetry/pronounce-assess).**
- We run on a React + Vite frontend with a Flask backend. Our database uses MongoDB.
- Backend is served on EC2, and frontend on CloudFront + S3.
- WebSockets for real-time speech evaluation.
- Three.js for WebGL rendering.
- ElevenLabs for Text-to-Speech.

<a id="features"></a>
## Features
Here are the current features of Talky.

### Iterative Lessons

Talky's lessons unlock iteratively based on the user's global performance on all phonemes, where weaker phonemes are prioritized to be selected for the next lesson.

<img width="3200" height="1726" alt="image" src="https://github.com/user-attachments/assets/fb49e283-08bf-4d00-a431-95543bea0eec" />

This is an example of our 3D terrain on which the our robot mascot, Rocky, walks.

<img width="3200" height="1652" alt="image" src="https://github.com/user-attachments/assets/081a367e-e8c7-47d2-b74f-6983fc5d3d63" />

<img width="3200" height="1654" alt="image" src="https://github.com/user-attachments/assets/c0a71eae-df08-4579-90e0-1c856b4bc161" />


### Voice Evaluation

Talky will use the Goodness of Pronounciation algorithm to provide a detailed phoneme-level score analysis for the user. Each phoneme is highlighted in real time as you speak, with its color indicating accuracy, as well as a side panel displaying the exact scores that was achieved for each phoneme.

<img width="3200" height="1656" alt="image" src="https://github.com/user-attachments/assets/f4cac665-4119-403a-a3f2-f67ce5ed74cb" />

### Progress Statistics

Talky also keeps track of your score progression for each phoneme over time and displays them in a statistics page.

<img width="3198" height="1720" alt="image" src="https://github.com/user-attachments/assets/ef853c34-644d-4f2a-b42d-6574a43bf0f4" />

### Super Sound Bank

The user can also choose to target-practice individual phonemes in the word bank. For each commonly-mispronounced phoneme, there is an interactice page which contains cards with words for that specific phoneme.

<img width="3200" height="1716" alt="image" src="https://github.com/user-attachments/assets/4605d891-ae4a-4c79-95a5-0e8be631a4d9" />

For fun, a card will be randomly selected for the user to practice, and a standard pronounciation will be generated according to the user's selected voice accent. 

<img width="3200" height="1692" alt="image" src="https://github.com/user-attachments/assets/d1c527e9-05d0-4bab-bc90-c0908c1da04d" />

<a id="getting-started"></a>

### Practice Game

We also have a pokemon + city builder style game for users to practice individual words. The user gains points by attacking game enemies, where attacks are fired through speaking the target words correctly. These points could be in turn used to play the long-term city builder game.

<img width="3200" height="1726" alt="image" src="https://github.com/user-attachments/assets/db6d9972-e3e8-4c63-89aa-48905ecca057" />

## Getting Started

Thanks for trying out Talky! You can not only try it our at our [link](https://talkwithtalky.org/), you could also run this project locally. To do this, here are some dependencies you would need: 
* [ffmpeg](https://www.ffmpeg.org/download.html)
* [Flask](https://flask.palletsprojects.com/en/stable/installation/)
* [React, Node.js](https://nodejs.org/en/download)

Next, clone the repository create a virtual environment. Then, install required packages. Change into the `./server` directory and run
```
pip install -r requirements.txt
```

and change into the `./talky-app` directory and run

```
npm i
```

You should run the frontend folder (talky-app) in a terminal, with
```
npm run dev
```

And run the server (server folder) in another terminal, with
```
python main.py
```

You should also create .env files in /server and /talky-app. The environment variables in /server should be
```
GROQ_API_KEY=YOUR_GROQ_API_KEY
DB_NAME=YOUR_MONGO_DB_NAME
MONGO_USERNAME=YOUR_MONGO_USERNAME_db_user
MONGO_PASSWORD=YOUR_MONGO_DB_PASSWORD
MONGO_URI=YOUR_MONGO_URI
```
The environment variables in /talky-app should be
```
VITE_AUTH0_DOMAIN=YOUR_AUTH0_DOMAIN
VITE_AUTH0_CLIENT_ID=YOUR_AUTH0_CLIENT_ID
VITE_AUTH0_AUDIENCE=YOUR_AUTH0_AUDIENCE
```

### On-device speech model (optional, recommended)

By default the browser streams raw microphone audio to the backend, which runs
wav2vec2 server-side. If you export the model to ONNX, the lesson page instead
runs wav2vec2 **in the browser** (WebGPU via transformers.js, with a WASM
fallback) and only streams the per-chunk logits to the backend for alignment —
the torch model never loads server-side. One-time export:

```
pip install "optimum[exporters]" onnx onnxruntime
python server/scripts/export_wav2vec2_onnx.py
```

This writes the model to `talky-app/public/models/` (git-ignored, ~1.2 GB —
serve it from a CDN in production, or upload it to a Hugging Face repo and set
`VITE_W2V2_MODEL` to that repo id instead). When the model is missing or the
browser can't load it, the app automatically falls back to streaming raw audio.

<a id="contributing"></a>
## Contributing

Hi! We really appreciate any contributions to this repository. When contributing, please follow these steps: 
- Fork the repository
- Make a branch from main
- Write your code. The setup instructions are described above
- Write tests for that code
- Make a pull request to the parent repository with your changes
Feel free to also check out [issues](https://github.com/superasymmetry/Talky-full-app/issues) for something to work on!

<a id="license"></a>
## License
All licenses in this repository are copyrighted by their respective authors.

Everything else is released under CC0.

------------------------------------------------------------------------------

No Copyright

The person who associated a work with this deed has dedicated the work to the
public domain by waiving all of his or her rights to the work worldwide under
copyright law, including all related and neighboring rights,
to the extent allowed by law.

You can copy, modify, distribute and perform the work, even for commercial
purposes, all without asking permission. See Other Information below.

Other Information:

    * In no way are the patent or trademark rights of any person affected
    by CC0, nor are the rights that other persons may have in the work or in
    how the work is used, such as publicity or privacy rights.

    * Unless expressly stated otherwise, the person who associated a work with
    this deed makes no warranties about the work, and disclaims liability for
    all uses of the work, to the fullest extent permitted by applicable law.

    * When using or citing the work, you should not imply endorsement
    by the author or the affirmer.

http://creativecommons.org/publicdomain/zero/1.0/legalcode

<a id="credits"></a>
## Credits

**Thank you to all the open-source contributors who helped with this project! Your hard work is truly appreciated!**

Besides that, though, here are the sources that inspired this project's approach to our main voice-evaluation feature.

```bibtex
@article{witt2000phone,
  title={Phone-level pronunciation scoring and assessment for interactive language learning},
  author={Witt, Steven M. and Young, Steve J.},
  journal={Speech Communication},
  volume={30},
  number={2--3},
  pages={95--108},
  year={2000},
  doi={10.1016/S0167-6393(99)00044-8}
}
```

```bibtex
@misc { phy22-phoneme,
  author       = {Phy, Vitou},
  title        = {{Automatic Phoneme Recognition on TIMIT Dataset with Wav2Vec 2.0}},
  year         = 2022,
  note         = {{If you use this model, please cite it using these metadata.}},
  publisher    = {Hugging Face},
  version      = {1.0},
  doi          = {10.57967/hf/0125},
  url          = {https://huggingface.co/vitouphy/wav2vec2-xls-r-300m-timit-phoneme}
}
```
