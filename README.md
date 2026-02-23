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

<a id="how"></a>
## How is Talky made?
Talky is made with many different technologies. Here are our major ones:
- React frontend (Vite, Three.js, Auth0, TailWind CSS)
- Flask backend (MongoDB, REST API)
- Goodness of Pronounciation Algorithm ([this](#credits) Huggingface model, [this](#credits) algorithm for evaluation, and the forced alignment algorithm)
- SpeechSynthesis by Mozilla

<a id="features"></a>
## Features
Here are some of the features of Talky! More are currently being implemented!

### Iterative Lessons

Talky has lessons which unlock when the previous lesson is completed. The subsequent lesson is then generated with content and exercises prioritizing the user's weakest phonemes.

<img height="1500" alt="image" src="https://github.com/user-attachments/assets/bca2136b-7855-4bdc-92f3-6146b714e139" />

For each lesson, the user will walk our robot mascot, Talky, to the end flag. When a sentence is pronounced well enough, the robot will advance forward in our 3D terrain.

<img height="1500" alt="image" src="https://github.com/user-attachments/assets/d3062c32-20db-493e-9d9e-b1a0cb2757c7" />

### Voice Evaluation

Talky will use the Goodness of Pronounciation algorithm to provide a detailed phoneme-level score analysis for the user. Each phoneme is colored with a different label depending on how well that phoneme was pronounced. A more precise score is also seen when hovering over each phoneme.

<img height="1500" alt="image" src="https://github.com/user-attachments/assets/b6bb290d-2f0b-4585-ac65-8d92d58103d6" />

### Super Sound Bank

The user can also choose to target-practice individual phonemes in the word bank. For each commonly-mispronounced phoneme, there is an interactice page which contains cards with words for that specific phoneme.

<img height="1500" alt="image" src="https://github.com/user-attachments/assets/9b21155d-8a03-4d5a-8030-1cb280767a72" />

For fun, a card will be randomly selected for the user to practice, and a standard pronounciation will be generated according to the user's selected voice accent. 

<img height="1500" alt="image" src="https://github.com/user-attachments/assets/f1e12668-01b7-4537-aff8-5f2bb279fe5f" />

<a id="getting-started"></a>
## Getting Started

Thanks for trying out Talky! While we had (will soon be reinstated) deployed link, you can also try out Talky locally. To do this, here are some dependencies you would need: 
* [ffmpeg](https://www.ffmpeg.org/download.html)
* [Flask](https://flask.palletsprojects.com/en/stable/installation/)
* [React, Node.js](https://nodejs.org/en/download)

Next, clone the repository create a virtual environment. Then, install required packages using:
```
pip install -r requirements.txt
```

You should run the frontend folder (talky-app) in a terminal, with
```
npm run dev
```

And run the server (server folder) in another terminal, with
```
python main.py
```

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
