#!/usr/bin/env python3
"""Generate a1-speaking-unit-1.md with 20 lessons x 10 speaking questions each."""

# (lesson_title, lesson_description, [(sentence, [srs_words...]), ...])
LESSONS = [
    ("Lesson 1: Greetings & Introductions", "Speak A1 greeting and introduction sentences aloud", [
        ("Hello, my name is Alan.", ["hello", "name"]),
        ("Nice to meet you.", ["nice", "meet"]),
        ("How are you today?", ["how", "today"]),
        ("I am fine, thank you.", ["fine", "thank"]),
        ("Good morning, everyone.", ["good", "morning"]),
        ("Goodbye, see you later.", ["goodbye", "later"]),
        ("What is your name?", ["what", "your"]),
        ("I come from London.", ["come", "from"]),
        ("Pleased to meet you.", ["pleased", "meet"]),
        ("Have a nice day!", ["have", "nice"]),
    ]),
    ("Lesson 2: Personal Information", "Talk about yourself and basic personal details", [
        ("My name is Maria.", ["name", "maria"]),
        ("I am twenty years old.", ["twenty", "years"]),
        ("I am a student.", ["student"]),
        ("I live in a small town.", ["live", "town"]),
        ("I speak English and Spanish.", ["speak", "english"]),
        ("My phone number is 555-1234.", ["phone", "number"]),
        ("I work in an office.", ["work", "office"]),
        ("I have two brothers.", ["have", "brothers"]),
        ("My birthday is in May.", ["birthday", "may"]),
        ("I am from Canada.", ["from", "canada"]),
    ]),
    ("Lesson 3: Family", "Describe family members and pets", [
        ("This is my mother.", ["this", "mother"]),
        ("I have a big family.", ["big", "family"]),
        ("My father is a teacher.", ["father", "teacher"]),
        ("She is my sister.", ["she", "sister"]),
        ("We love our grandparents.", ["we", "grandparents"]),
        ("My brother is ten years old.", ["brother", "ten"]),
        ("They live with us.", ["they", "us"]),
        ("I have one cat.", ["have", "cat"]),
        ("Our dog is very friendly.", ["our", "dog"]),
        ("Family is important to me.", ["family", "important"]),
    ]),
    ("Lesson 4: Numbers & Counting", "Practice numbers and counting", [
        ("I have three apples.", ["three", "apples"]),
        ("There are twelve chairs.", ["twelve", "chairs"]),
        ("The book costs five dollars.", ["book", "dollars"]),
        ("We need ten plates.", ["ten", "plates"]),
        ("He is seven years old.", ["seven", "years"]),
        ("I bought two tickets.", ["two", "tickets"]),
        ("She has six pencils.", ["six", "pencils"]),
        ("The class has twenty students.", ["class", "students"]),
        ("We ate four pizzas.", ["four", "pizzas"]),
        ("There are eight windows.", ["eight", "windows"]),
    ]),
    ("Lesson 5: Days, Months & Time", "Tell the time and talk about days", [
        ("Today is Monday.", ["today", "monday"]),
        ("My birthday is in June.", ["birthday", "june"]),
        ("The meeting is at nine.", ["meeting", "nine"]),
        ("I wake up at seven o'clock.", ["wake", "clock"]),
        ("We eat dinner at eight.", ["eat", "dinner"]),
        ("Tomorrow is Friday.", ["tomorrow", "friday"]),
        ("The store opens at ten.", ["store", "opens"]),
        ("I study in the morning.", ["study", "morning"]),
        ("The movie starts at eight.", ["movie", "starts"]),
        ("Sunday is my favorite day.", ["sunday", "favorite"]),
    ]),
    ("Lesson 6: Daily Routine", "Describe your everyday routine", [
        ("I brush my teeth every day.", ["brush", "teeth"]),
        ("I take a shower in the morning.", ["shower", "morning"]),
        ("I eat breakfast at seven.", ["eat", "breakfast"]),
        ("I go to work by bus.", ["work", "bus"]),
        ("I come home at six.", ["come", "home"]),
        ("I cook dinner for my family.", ["cook", "dinner"]),
        ("I watch TV in the evening.", ["watch", "evening"]),
        ("I read a book before bed.", ["read", "book"]),
        ("I go to sleep at ten.", ["sleep", "ten"]),
        ("I drink coffee every morning.", ["drink", "coffee"]),
    ]),
    ("Lesson 7: Food & Drink", "Order and talk about food", [
        ("I like pizza very much.", ["like", "pizza"]),
        ("We eat rice and vegetables.", ["rice", "vegetables"]),
        ("He drinks orange juice.", ["drinks", "juice"]),
        ("The soup is delicious.", ["soup", "delicious"]),
        ("I want a glass of water.", ["want", "water"]),
        ("She eats an apple every day.", ["eats", "apple"]),
        ("We order Chinese food.", ["order", "food"]),
        ("The restaurant is near here.", ["restaurant", "near"]),
        ("I am hungry now.", ["hungry", "now"]),
        ("Do you like chocolate?", ["like", "chocolate"]),
    ]),
    ("Lesson 8: Shopping", "Shop and ask about prices", [
        ("How much is this shirt?", ["much", "shirt"]),
        ("I want to buy two books.", ["want", "books"]),
        ("The shoes are on sale.", ["shoes", "sale"]),
        ("I need a new phone.", ["need", "phone"]),
        ("Where is the cashier?", ["where", "cashier"]),
        ("I pay with my card.", ["pay", "card"]),
        ("Do you have this in blue?", ["have", "blue"]),
        ("The market is very busy.", ["market", "busy"]),
        ("I forgot my wallet.", ["forgot", "wallet"]),
        ("Can I have a bag, please?", ["bag", "please"]),
    ]),
    ("Lesson 9: Colors & Clothes", "Describe colors and clothing", [
        ("My favorite color is blue.", ["favorite", "blue"]),
        ("She wears a red dress.", ["wears", "red"]),
        ("I have a green sweater.", ["green", "sweater"]),
        ("He puts on his shoes.", ["puts", "shoes"]),
        ("The yellow hat is mine.", ["yellow", "hat"]),
        ("I need a warm coat.", ["warm", "coat"]),
        ("These socks are black.", ["socks", "black"]),
        ("She buys white shoes.", ["white", "shoes"]),
        ("My jacket is too small.", ["jacket", "small"]),
        ("I like the orange shirt.", ["orange", "shirt"]),
    ]),
    ("Lesson 10: Weather", "Talk about the weather and seasons", [
        ("It is a sunny day.", ["sunny", "day"]),
        ("Today it is raining.", ["raining"]),
        ("It is very cold outside.", ["cold", "outside"]),
        ("The weather is nice.", ["weather", "nice"]),
        ("I think it will snow.", ["snow"]),
        ("The wind is strong.", ["wind", "strong"]),
        ("We need an umbrella.", ["umbrella"]),
        ("It is hot in summer.", ["hot", "summer"]),
        ("The sky is blue.", ["sky", "blue"]),
        ("Spring is my favorite season.", ["spring", "season"]),
    ]),
    ("Lesson 11: Home & Furniture", "Describe your home", [
        ("This is my house.", ["house"]),
        ("The kitchen is very clean.", ["kitchen", "clean"]),
        ("I sleep in my bedroom.", ["bedroom"]),
        ("We sit on the sofa.", ["sofa"]),
        ("The table is in the dining room.", ["table", "dining"]),
        ("I read in the living room.", ["living", "room"]),
        ("The bathroom is upstairs.", ["bathroom", "upstairs"]),
        ("We have a small garden.", ["garden"]),
        ("The window is open.", ["window", "open"]),
        ("I lock the door at night.", ["lock", "door"]),
    ]),
    ("Lesson 12: School & Work", "Talk about school and work", [
        ("I go to school by bike.", ["school", "bike"]),
        ("The teacher is very kind.", ["teacher", "kind"]),
        ("I study English every day.", ["study", "english"]),
        ("We have a test on Friday.", ["test", "friday"]),
        ("My office is on the third floor.", ["office", "floor"]),
        ("I finish work at five.", ["finish", "five"]),
        ("She writes on the board.", ["writes", "board"]),
        ("I learn new words.", ["learn", "words"]),
        ("The library is quiet.", ["library", "quiet"]),
        ("I like my job.", ["like", "job"]),
    ]),
    ("Lesson 13: Hobbies & Free Time", "Talk about hobbies and free time", [
        ("I like to play soccer.", ["play", "soccer"]),
        ("She enjoys painting.", ["enjoys", "painting"]),
        ("We listen to music.", ["listen", "music"]),
        ("I watch movies on weekends.", ["watch", "movies"]),
        ("He collects stamps.", ["collects", "stamps"]),
        ("I go swimming in summer.", ["swimming", "summer"]),
        ("They play video games.", ["video", "games"]),
        ("I take photos of nature.", ["photos", "nature"]),
        ("We dance at parties.", ["dance", "parties"]),
        ("Reading is my hobby.", ["reading", "hobby"]),
    ]),
    ("Lesson 14: Transportation & Directions", "Ask for and give directions", [
        ("I take the train to work.", ["train", "work"]),
        ("Where is the station?", ["where", "station"]),
        ("Turn left at the corner.", ["turn", "corner"]),
        ("The bus stop is there.", ["bus", "stop"]),
        ("Go straight ahead.", ["straight", "ahead"]),
        ("I drive a red car.", ["drive", "car"]),
        ("The airport is far away.", ["airport", "far"]),
        ("We walk to the park.", ["walk", "park"]),
        ("Is the museum near here?", ["museum", "near"]),
        ("Excuse me, where is the bank?", ["excuse", "bank"]),
    ]),
    ("Lesson 15: Health & Body", "Talk about health and the body", [
        ("I have a headache.", ["headache"]),
        ("She goes to the doctor.", ["doctor"]),
        ("I feel sick today.", ["feel", "sick"]),
        ("He has a fever.", ["fever"]),
        ("Please take this medicine.", ["medicine"]),
        ("My leg hurts.", ["leg", "hurts"]),
        ("We should exercise daily.", ["exercise", "daily"]),
        ("I eat healthy food.", ["healthy", "food"]),
        ("Drink water when you are thirsty.", ["water", "thirsty"]),
        ("Rest well and sleep more.", ["rest", "sleep"]),
    ]),
    ("Lesson 16: Feelings & Emotions", "Express feelings and emotions", [
        ("I am very happy today.", ["happy", "today"]),
        ("She is angry with me.", ["angry", "me"]),
        ("We are excited for the trip.", ["excited", "trip"]),
        ("He feels tired after work.", ["tired", "work"]),
        ("I am a little sad.", ["sad"]),
        ("They are surprised by the news.", ["surprised", "news"]),
        ("I feel calm at home.", ["calm", "home"]),
        ("She is proud of her son.", ["proud", "son"]),
        ("We are worried about the exam.", ["worried", "exam"]),
        ("He is bored at home.", ["bored", "home"]),
    ]),
    ("Lesson 17: Making Plans & Invitations", "Make plans and invite friends", [
        ("Would you like to come?", ["would", "come"]),
        ("Let's meet at six.", ["lets", "meet"]),
        ("I want to see a movie.", ["want", "movie"]),
        ("Are you free on Saturday?", ["free", "saturday"]),
        ("We can go together.", ["together"]),
        ("What time shall we meet?", ["time", "meet"]),
        ("I will bring some food.", ["bring", "food"]),
        ("Please join us for dinner.", ["join", "dinner"]),
        ("Call me later.", ["call", "later"]),
        ("See you at the cafe.", ["cafe"]),
    ]),
    ("Lesson 18: Past Activities", "Talk about things you did (simple past)", [
        ("I went to the park yesterday.", ["went", "yesterday"]),
        ("She cooked a nice meal.", ["cooked", "meal"]),
        ("We watched a good film.", ["watched", "film"]),
        ("He bought a new phone.", ["bought", "phone"]),
        ("I ate pizza for lunch.", ["ate", "lunch"]),
        ("They visited their grandparents.", ["visited", "grandparents"]),
        ("I read an interesting book.", ["read", "interesting"]),
        ("We drank coffee together.", ["drank", "coffee"]),
        ("She wrote a letter.", ["wrote", "letter"]),
        ("I slept late on Sunday.", ["slept", "sunday"]),
    ]),
    ("Lesson 19: Future Plans", "Talk about future plans", [
        ("I will travel to Japan.", ["travel", "japan"]),
        ("We are going to the beach.", ["beach"]),
        ("She will call you tomorrow.", ["call", "tomorrow"]),
        ("I am planning a party.", ["planning", "party"]),
        ("He will start a new job.", ["start", "job"]),
        ("We will learn to swim.", ["learn", "swim"]),
        ("I am going to study medicine.", ["study", "medicine"]),
        ("They will move to Paris.", ["move", "paris"]),
        ("I will buy a gift.", ["buy", "gift"]),
        ("We hope to visit you.", ["hope", "visit"]),
    ]),
    ("Lesson 20: Travel & Holidays", "Talk about travel and holidays", [
        ("I need to pack my suitcase.", ["pack", "suitcase"]),
        ("The hotel is near the sea.", ["hotel", "sea"]),
        ("We took many photos.", ["took", "photos"]),
        ("I booked a flight online.", ["booked", "flight"]),
        ("The beach is beautiful.", ["beach", "beautiful"]),
        ("We ate local food.", ["local", "food"]),
        ("I lost my passport.", ["lost", "passport"]),
        ("The tour guide was helpful.", ["tour", "guide"]),
        ("We sailed on a boat.", ["sailed", "boat"]),
        ("Holidays are the best time.", ["holidays", "best"]),
    ]),
]


def main():
    out = []
    # Unit frontmatter
    out.append("---")
    out.append('unitTitle: "Unit 1: A1 Speaking Practice (20 Lessons)"')
    out.append('description: "A1 Speaking Practice — 20 lessons x 10 questions"')
    out.append('icon: "🎙️"')
    out.append('color: "#E91E63"')
    out.append('targetLanguage: "en"')
    out.append('sourceLanguage: "en"')
    out.append('level: "A1"')
    out.append('courseId: "a1-speaking-course"')
    out.append('questionType: "speaking"')
    out.append("---")
    out.append("")

    for idx, (title, desc, exercises) in enumerate(LESSONS, start=1):
        out.append("---")
        out.append(f'lessonTitle: "{title}"')
        out.append(f'description: "{desc}"')
        out.append('icon: "🎙️"')
        out.append('color: "#FF9600"')
        out.append("---")
        out.append("")
        for sentence, words in exercises:
            out.append("[speaking]")
            out.append(f'sentence: "{sentence}"')
            out.append('srsWords: ' + " ".join(f'"{w}"' for w in words))
            out.append("")

    content = "\n".join(out).rstrip() + "\n"
    with open("content/a1-speaking-unit-1.md", "w", encoding="utf-8") as f:
        f.write(content)
    total = sum(len(ex) for _, _, ex in LESSONS)
    print(f"Wrote content/a1-speaking-unit-1.md: {len(LESSONS)} lessons, {total} speaking questions")


if __name__ == "__main__":
    main()
