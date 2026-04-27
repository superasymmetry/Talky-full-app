# Talky!

The Duolingo for speech therapy–we're making better speech accessible to all, without the crazy costs.

[![Join Talky Slack](https://img.shields.io/badge/slack-join_chat-white.svg?logo=slack&style=social)](https://join.slack.com/your-slack-link)
[![GitHub Stars](https://img.shields.io/github/stars/superasymmetry/Talky-full-app?style=social)](https://github.com/superasymmetry/Talky-full-app)
[![GitHub Issues](https://img.shields.io/github/issues/superasymmetry/Talky-full-app)](https://github.com/superasymmetry/Talky-full-app/issues)

<img src="https://github.com/user-attachments/assets/f0668ef6-f12f-4eb9-8087-b06f4b2c8c6b" width="80" alt="Talky Logo">

## What is Talky?
1 in 14 US children and over 3 million US adults have some sort of speech impediment. However, solutions to mitigate these impediments often have extremely high costs, with many services being over $1000 per month. We want to fix that for those who need it. Talky is an open-source, gamified speech evaluator to help you improve your speaking and pronounciation. With lessons and targeted practice exercises covering all common phoneme mispronounciations, and a [scientifically-backed](#credits) method for giving a detailed phoneme-level pronounciation score to each sentence spoken.

## How is Talky made?
Talky is made with many different technologies. Here are our major ones:
- React frontend (Vite, Three.js, Auth0, TailWind CSS)
- Flask backend (MongoDB, REST API)
- Goodness of Pronounciation Algorithm ([this](#credits) Huggingface model, [this](#credits) algorithm for evaluation, and the forced alignment algorithm)
- SpeechSynthesis by Mozilla


## Features
Here are some of the features of Talky! More are currently being implemented!

### Iterative Lessons

Talky has lessons which unlock when the previous lesson is completed. The subsequent lesson is then generated with content and exercises prioritizing the user's weakest phonemes.

<img width="3199" height="1721" alt="image" src="https://github.com/user-attachments/assets/bca2136b-7855-4bdc-92f3-6146b714e139" />

For each lesson, the user will walk our robot mascot, Talky, to the end flag. When a sentence is pronounced well enough, the robot will advance forward in our 3D terrain.

<img width="3198" height="1715" alt="image" src="https://github.com/user-attachments/assets/d3062c32-20db-493e-9d9e-b1a0cb2757c7" />

### Voice Evaluation

Talky will use the Goodness of Pronounciation algorithm to provide a detailed phoneme-level score analysis for the user. Each phoneme is colored with a different label depending on how well that phoneme was pronounced. A more precise score is also seen when hovering over each phoneme.

<img width="3196" height="1713" alt="image" src="https://github.com/user-attachments/assets/b6bb290d-2f0b-4585-ac65-8d92d58103d6" />

### Super Sound Bank

The user can also choose to target-practice individual phonemes in the word bank. For each commonly-mispronounced phoneme, there is an interactice page which contains cards with words for that specific phoneme.

<img width="3197" height="1718" alt="image" src="https://github.com/user-attachments/assets/9b21155d-8a03-4d5a-8030-1cb280767a72" />

For fun, a card will be randomly selected for the user to practice, and a standard pronounciation will be generated according to the user's selected voice accent. 

<img width="3199" height="1712" alt="image" src="https://github.com/user-attachments/assets/f1e12668-01b7-4537-aff8-5f2bb279fe5f" />

### Contributing

Hi! We really appreciate any contributions to this repository. When contributing, please follow these steps: 
- Fork the repository
- Make a branch from main
- Write your code
- Write tests for that code
- Make a pull request to the parent repository with your changes
Feel free to also check out [issues](https://github.com/superasymmetry/Talky-full-app/issues) for something to work on!

## License
MIT

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
